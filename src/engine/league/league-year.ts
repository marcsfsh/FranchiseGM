/**
 * The new league year (spec 4.1, 11.1): when free agency opens, each team's unused cap space carries over,
 * the cap grows by a blend of a fixed rate and league revenue growth, and the pay scales tied to it follow.
 * Contracts that ran out end, their players free to sign anywhere, a deal whose next year was an option
 * nobody picked up ends as declined, and players on the reserve lists rejoin their teams' rosters.
 */
import { TEAM_ABBRS, type TeamAbbr } from '../../data/team-colors';
import { capSheet } from '../cap/sheet';
import { endContract } from '../contracts/moves';
import type { Contract } from '../contracts/types';
import { leagueYear, type GameDate } from '../model/calendar';
import type { Rng } from '../rng';
import type { RuleSet } from '../rules/ruleset';
import { TUNING } from '../tuning';
import type { League } from './types';

const Y = TUNING.leagueYear;

export interface LeagueYearChange {
  year: number;
  capBefore: number;
  cap: number;
  /** Space each team carried over into the new league year. */
  carryover: Record<TeamAbbr, number>;
  /** Players whose contracts ran out, with the team they left. */
  expired: { playerId: string; team: TeamAbbr }[];
}

/**
 * Next league year's cap (spec 11.1): oldCap x (1 + w x fixedRate + (1 - w) x revenueGrowth), the yearly
 * change held within the floor and ceiling.
 */
export function nextCap(rules: RuleSet, revenueGrowth: number): number {
  const c = rules.cap;
  const growth = c.growthFixedWeight * c.growthFixedRate + (1 - c.growthFixedWeight) * revenueGrowth;
  const bounded = Math.min(c.growthCeiling, Math.max(c.growthFloor, growth));
  return Math.round((c.amount * (1 + bounded)) / Y.capRound) * Y.capRound;
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
      minimumSigningBonus: grow(rules.rookieScale.minimumSigningBonus, Y.salaryRound)
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
  const [mean, spread] = Y.revenueGrowth;
  league.rules = withCap(league.rules, nextCap(league.rules, rng.normal(mean, spread)));
  league.date = { ...date };
  for (const abbr of TEAM_ABBRS) league.teams[abbr].carryover = carryover[abbr];

  const expired: { playerId: string; team: TeamAbbr }[] = [];
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
      league.contracts[contract.id] = endContract(contract, {
        date: { ...date },
        how: 'declined',
        designated: false,
        injured: false,
        terminationPay: false
      });
    // A deal signed to follow this one (an extension, a tag, or a tender) takes over.
    const next = player.nextContractId ? league.contracts[player.nextContractId] : undefined;
    delete player.nextContractId;
    if (next && !next.ended && next.team === player.team && runsInto(next, year)) {
      player.contractId = next.id;
      rejoin();
      continue;
    }
    expired.push({ playerId: player.id, team: player.team });
    Object.assign(player, { team: null, status: 'freeAgent', contractId: null });
  }
  for (const abbr of TEAM_ABBRS) league.teams[abbr].resting = [];
  return { year, capBefore, cap: league.rules.cap.amount, carryover, expired };
}
