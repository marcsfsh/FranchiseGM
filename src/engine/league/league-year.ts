/**
 * The new league year (spec 4.1, 11.1): when free agency opens, the year that ends counts toward the salary
 * floor, each team's unused cap space carries over, the cap grows by a blend of a fixed rate and league
 * revenue growth, and the pay scales tied to it follow.
 * Contracts that ran out end, their players free to sign anywhere, a deal whose next year was an option
 * nobody picked up ends as declined, and players on the reserve lists rejoin their teams' rosters.
 */
import { TEAM_ABBRS, type TeamAbbr } from '../../data/team-colors';
import { closeFloorYear, type FloorShortfall } from '../cap/floor';
import { nextCap } from '../cap/growth';
import { capSheet } from '../cap/sheet';
import { guaranteedAt, splitsDeadMoney } from '../contracts/cap';
import { contractRecord, type ContractRecord } from '../contracts/history';
import { clearDemands } from '../contracts/holdouts';
import { endContract } from '../contracts/moves';
import { resetNegotiations } from '../contracts/negotiation';
import {
  currentTagShares,
  freeAgentKind,
  tenderAmount,
  TENDER_LABELS,
  type TenderLevel
} from '../contracts/resign';
import type { Contract } from '../contracts/types';
import { resetMorale } from '../locker/room';
import { leagueYear, type GameDate } from '../model/calendar';
import type { Rng } from '../rng';
import { minimumSalary, type RuleSet } from '../rules/ruleset';
import { TUNING } from '../tuning';
import type { League } from './types';
import { dropContract, putContract } from './contract-index';

const Y = TUNING.leagueYear;

export { nextCap };

export interface LeagueYearChange {
  year: number;
  capBefore: number;
  cap: number;
  /** Space each team carried over into the new league year. */
  carryover: Record<TeamAbbr, number>;
  /** Players whose contracts ran out, with the team they left. */
  expired: { playerId: string; team: TeamAbbr }[];
  /** Teams whose cash spending fell short of the salary floor over a window that just closed. */
  shortfalls: FloorShortfall[];
  /** Records of the spent deals that left the league, for the players' histories (D-35). */
  records: ContractRecord[];
}

/** The rule set with a new cap, and the minimums, practice squad pay, and rookie scale grown with it. */
export function withCap(rules: RuleSet, cap: number): RuleSet {
  const factor = cap / rules.cap.amount;
  const grow = (value: number, step: number): number => Math.round((value * factor) / step) * step;
  const pay = rules.pay;
  return {
    ...rules,
    cap: { ...rules.cap, amount: cap },
    pay: pay.minimumGrowsWithCap
      ? {
          ...pay,
          minimumSalary: pay.minimumSalary.map(v => grow(v, Y.salaryRound)),
          practiceSquadWeekly: grow(pay.practiceSquadWeekly, Y.weeklyRound),
          practiceSquadVeteranWeeklyMin: grow(pay.practiceSquadVeteranWeeklyMin, Y.weeklyRound),
          practiceSquadVeteranWeeklyMax: grow(pay.practiceSquadVeteranWeeklyMax, Y.weeklyRound)
        }
      : pay,
    rookieScale: {
      ...rules.rookieScale,
      topSigningBonus: grow(rules.rookieScale.topSigningBonus, Y.salaryRound),
      minimumSigningBonus: grow(rules.rookieScale.minimumSigningBonus, Y.salaryRound),
      udfaBonusPool: grow(rules.rookieScale.udfaBonusPool, Y.salaryRound)
    },
    tags: {
      ...rules.tags,
      tenders: {
        firstRound: grow(rules.tags.tenders.firstRound, Y.salaryRound),
        secondRound: grow(rules.tags.tenders.secondRound, Y.salaryRound),
        originalRound: grow(rules.tags.tenders.originalRound, Y.salaryRound)
      }
    }
  };
}

/** A deal's years that run: void years only spread proration, and an option year runs once exercised. */
const runningYears = (c: Contract): number[] =>
  c.years.filter(y => !y.isVoid && (y.option === null || y.optionExercised === true)).map(y => y.year);

/** Whether a deal runs into a league year. */
export const runsInto = (c: Contract, year: number): boolean => runningYears(c).some(y => y >= year);

/**
 * Opens the league year that starts on `date` (free agency's first week), from the day before it. Returns
 * what changed, for the news and the inbox.
 */
export function openLeagueYear(league: League, date: GameDate, rng: Rng): LeagueYearChange {
  const before = leagueYear(league.date);
  const year = leagueYear(date);
  // Space left at the end of the old league year carries over (spec 11.1).
  const carryover = Object.fromEntries(
    TEAM_ABBRS.map(abbr => [
      abbr,
      league.rules.cap.rollover ? Math.max(0, capSheet(league, abbr, before).space) : 0
    ])
  ) as Record<TeamAbbr, number>;
  const capBefore = league.rules.cap.amount;
  // The closing year's top cap hits by tag position price the tags of the next five (D-39).
  league.tagShares[before] = currentTagShares(league);
  // The year that closes counts toward the salary floor (spec 11.1).
  const shortfalls = closeFloorYear(league, before);
  const [mean, spread] = Y.revenueGrowth;
  league.rules = withCap(league.rules, nextCap(league.rules, rng.normal(mean, spread)));
  league.caps[year] = league.rules.cap.amount;
  league.date = { ...date };
  for (const abbr of TEAM_ABBRS) league.teams[abbr].carryover = carryover[abbr];
  // A new league year eases last season's highs and lows (spec 10.9).
  resetMorale(league);
  resetNegotiations(league);
  // Holdouts and trade requests end with the league year (spec 11.9).
  clearDemands(league);

  const expired: { playerId: string; team: TeamAbbr }[] = [];
  // The unrestricted free agents who hit the market count toward compensatory picks (spec 11.8).
  const departed: Record<string, TeamAbbr> = {};
  for (const player of Object.values(league.players)) {
    const contract = player.contractId ? league.contracts[player.contractId] : undefined;
    if (!contract || !player.team) continue;
    // The reserve lists clear with the new league year; a suspension carries on.
    const rejoin = () => {
      if (player.status === 'ir' || player.status === 'pup' || player.status === 'nfi')
        player.status = 'active';
    };
    if (runsInto(contract, year)) {
      rejoin();
      continue;
    }
    // A deal with an option year nobody exercised ends as declined, which accelerates its proration.
    if (contract.years.some(y => y.year >= year && !y.isVoid))
      putContract(
        league,
        endContract(contract, {
          date: { ...date },
          how: 'declined',
          designated: false,
          injured: false,
          terminationPay: false
        })
      );
    // A deal signed to follow this one (an extension, a tag, or a tender) takes over.
    const next = player.nextContractId ? league.contracts[player.nextContractId] : undefined;
    delete player.nextContractId;
    if (next && !next.ended && next.team === player.team && runsInto(next, year)) {
      player.contractId = next.id;
      rejoin();
      continue;
    }
    expired.push({ playerId: player.id, team: player.team });
    if (freeAgentKind(league, player) === 'unrestricted') departed[player.id] = player.team;
    Object.assign(player, { team: null, lastTeam: player.team, status: 'freeAgent', contractId: null });
  }
  league.departures = { year, players: departed };
  for (const abbr of TEAM_ABBRS) league.teams[abbr].resting = [];
  meetNewScales(league, year);
  const records = dropSpentContracts(league, year);
  return { year, capBefore, cap: league.rules.cap.amount, carryover, expired, shortfalls, records };
}

/**
 * Pay below the new league year's scales rises to meet them (spec 11.1, 11.5): each running deal's base
 * salary this year to the minimum for the player's credited seasons, and a tender to its level's new
 * amount. A fully guaranteed base stays fully guaranteed.
 */
function meetNewScales(league: League, year: number): void {
  for (const player of Object.values(league.players)) {
    const contract = player.team && player.contractId ? league.contracts[player.contractId] : undefined;
    if (!contract || contract.ended || contract.type === 'practiceSquad') continue;
    const index = contract.years.findIndex(y => y.year === year && runningYears(contract).includes(y.year));
    const current = contract.years[index];
    if (!current) continue;
    const tender =
      contract.type === 'rfaTender' && contract.rights && contract.rights in TENDER_LABELS
        ? tenderAmount(league.rules, contract.rights as TenderLevel)
        : 0;
    const floor = Math.max(minimumSalary(league.rules, player.experience), tender);
    if (current.base >= floor) continue;
    const raised = {
      ...current,
      base: floor,
      guaranteedBase: current.guaranteedBase === current.base ? floor : current.guaranteedBase
    };
    putContract(league, {
      ...contract,
      years: contract.years.map((y, i) => (i === index ? raised : y))
    });
  }
}

/** League years a tag is kept after its last charge: a third straight tag looks back two (D-61). */
const KEPT_TAG_YEARS = 2;

const TAGS = new Set<Contract['type']>(['franchiseTag', 'transitionTag']);

/**
 * The last league year a deal charges the cap or pays cash: its last year while it runs, or one it replaced
 * whose proration still counts; else its end's year, the next one when its dead money splits, or a later year
 * of guaranteed salary still owed after a release.
 */
function lastCharged(c: Contract, rules: RuleSet): number {
  const last = Math.max(leagueYear(c.signed), ...c.years.map(y => y.year));
  const end = c.ended;
  if (!end || end.how === 'replaced') return last;
  let through = leagueYear(end.date) + (splitsDeadMoney(end, rules) ? 1 : 0);
  if (end.how === 'released')
    for (const y of c.years)
      if (y.year > through && !y.isVoid && guaranteedAt(c, y, end.date, end.injured) > 0) through = y.year;
  return through;
}

/**
 * Drops the contracts with nothing left to do (D-31, D-61): no player holds one or is due to take it over,
 * none is on waivers, and its last charge to the cap or cash came in a league year now closed, two before
 * that for a tag, which a third straight tag looks back to. A deal released with years to run ends its
 * charges when it ends, apart from guaranteed salary still owed. Cap figures are always computed from
 * contracts (spec 6.5), and these compute to nothing now; keeping them would only slow every cap sheet as the
 * seasons pass. Returns each dropped deal's record, for the players' histories (D-35).
 */
function dropSpentContracts(league: League, year: number): ContractRecord[] {
  const held = new Set<string>(league.waivers.map(w => w.contractId));
  for (const p of Object.values(league.players)) {
    if (p.contractId) held.add(p.contractId);
    if (p.nextContractId) held.add(p.nextContractId);
  }
  const records: ContractRecord[] = [];
  for (const c of Object.values(league.contracts)) {
    const kept = TAGS.has(c.type) ? KEPT_TAG_YEARS : 0;
    if (held.has(c.id) || lastCharged(c, league.rules) >= year - kept) continue;
    // Its record goes to the player's history first (D-35).
    records.push(contractRecord(league, c));
    dropContract(league, c.id);
  }
  return records;
}
