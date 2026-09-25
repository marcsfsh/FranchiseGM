/**
 * The team cap sheet (spec 11.1, 11.2): every contract's charge to the team's cap in a league year, what
 * deals that ended still charge, the pay of practice squad players elevated for games, and the space left
 * under the cap plus rollover. From the start of the league year until the regular season only the largest
 * roster charges count (the rule of 51), and a release with a June 1 designation keeps its full charge
 * until June 2. A sheet can also be computed after a proposed move, so previews follow the same rules.
 */
import type { TeamAbbr } from '../../data/team-colors';
import { afterJune1, capCharge, payWeek, type CapCharge, type CapFacts } from '../contracts/cap';
import type { Contract } from '../contracts/types';
import type { League } from '../league/types';
import { leagueYear } from '../model/calendar';
import type { RosterStatus } from '../model/player';
import { minimumSalary } from '../rules/ruleset';

export interface CapSheetLine {
  playerId: string;
  contractId: string;
  /** The player's roster status for his current deal; null for a deal that ended. */
  status: RosterStatus | null;
  charge: CapCharge;
  /** Whether it counts against the cap: in the offseason only the largest roster charges do. */
  counts: boolean;
  /** A deal replaced by another for the same player (a practice squad deal on promotion). */
  replaced?: boolean;
  /** A June 1 release still holding its full charge until June 2. */
  held?: boolean;
}

export interface CapSheet {
  team: TeamAbbr;
  year: number;
  cap: number;
  /** Unused space carried over from the last league year (spec 11.1). */
  carryover: number;
  /** Roster lines by charge, largest first, then deals that ended. */
  lines: CapSheetLine[];
  /** Whether the rule of 51 applies: the offseason of the current league year, or a later one. */
  offseason: boolean;
  /** Roster charges that count. */
  roster: number;
  /** Dead money: proration and money accelerated or owed from deals that ended, and held June 1 releases. */
  dead: number;
  /** Salary and bonuses earned before a deal ended by players no longer on the roster. */
  departed: number;
  /** Earlier deals of players still here (practice squad pay before a promotion). */
  earlier: number;
  /** Elevated practice squad players' pay for game weeks, above their practice squad pay. */
  elevations: number;
  used: number;
  space: number;
}

/** A proposed move's contracts, for a sheet computed after it. */
export interface SheetChange {
  /** Contracts that replace ones with the same ID (ended, restructured). */
  replace?: readonly Contract[];
  /** New contracts of players joining, with their roster status. */
  add?: readonly { contract: Contract; status: RosterStatus }[];
  /** A practice squad player to be elevated for this week's game. */
  elevate?: string;
}

/** Facts about a player the cap needs: games of the current season he sat inactive. */
export function capFacts(league: League, playerId: string): CapFacts {
  return {
    inactive: year => (year === league.season.season ? (league.season.inactive[playerId] ?? 0) : 0)
  };
}

/** The contracts that charge a team's cap: its players' current deals and every deal that ended there. */
export function teamContracts(league: League, abbr: TeamAbbr): Contract[] {
  return Object.values(league.contracts).filter(c => c.team === abbr);
}

/** Whether the rule of 51 applies to a league year on the league's date. */
export function offseasonCount(league: League, year: number): boolean {
  const current = leagueYear(league.date);
  if (year !== current) return year > current;
  return league.date.phase !== 'regularSeason' && payWeek(league.date, year, league.rules) === 1;
}

/** An elevated player's extra pay for a game: the active minimum's week less his practice squad week. */
export function elevationCost(league: League, playerId: string): number {
  const p = league.players[playerId];
  if (!p) return 0;
  const weekly = Math.round(minimumSalary(league.rules, p.experience) / league.rules.season.weeks);
  const squad = p.contractId ? (league.contracts[p.contractId]?.weeklyPay ?? 0) : 0;
  return Math.max(0, weekly - squad);
}

/** A team's cap sheet for a league year (the current one by default), optionally after a proposed move. */
export function capSheet(
  league: League,
  abbr: TeamAbbr,
  year = leagueYear(league.date),
  change: SheetChange = {}
): CapSheet {
  const rules = league.rules;
  const current = leagueYear(league.date);
  const offseason = offseasonCount(league, year);
  const replaced = new Map((change.replace ?? []).map(c => [c.id, c]));
  const added = new Map((change.add ?? []).map(a => [a.contract.id, a.status]));
  const contracts = [
    ...teamContracts(league, abbr).map(c => replaced.get(c.id) ?? c),
    ...(change.add ?? []).map(a => a.contract)
  ];
  const roster: CapSheetLine[] = [];
  const ended: CapSheetLine[] = [];
  for (const c of contracts) {
    const player = league.players[c.playerId];
    const status = added.get(c.id);
    const isCurrent = status !== undefined || (!c.ended && player?.contractId === c.id && player.team === abbr);
    // A June 1 release keeps his whole charge on the books until June 2 (spec 11.2).
    const held = !!c.ended?.designated && leagueYear(c.ended.date) === year && current === year && !afterJune1(league.date, rules);
    const charge = capCharge(held ? { ...c, ended: null } : c, year, rules, capFacts(league, c.playerId));
    if (isCurrent) {
      // A deal that doesn't reach this year has nothing to show: he'd be a free agent by then.
      if (charge.total === 0 && !c.years.some(y => y.year === year)) continue;
      roster.push({ playerId: c.playerId, contractId: c.id, status: status ?? player?.status ?? 'active', charge, counts: true });
    } else if (charge.total !== 0) {
      ended.push({ playerId: c.playerId, contractId: c.id, status: null, charge, counts: true, replaced: c.ended?.how === 'replaced', held });
    }
  } // prettier-ignore
  const byCharge = (a: CapSheetLine, b: CapSheetLine) =>
    b.charge.total - a.charge.total || (a.playerId < b.playerId ? -1 : 1);
  roster.sort(byCharge);
  ended.sort(byCharge);
  if (offseason) roster.forEach((line, i) => (line.counts = i < rules.cap.offseasonCount));
  const sum = (lines: CapSheetLine[], part: (c: CapCharge) => number) =>
    lines.reduce((total, l) => total + part(l.charge), 0);
  const gone = ended.filter(l => !l.replaced);
  const rosterTotal = roster.reduce((total, l) => total + (l.counts ? l.charge.total : 0), 0);
  // A held June 1 release is dead money in full: none of it is pay he earned before leaving.
  const dead = sum(gone.filter(l => l.held), c => c.total) + sum(gone.filter(l => !l.held), c => c.proration + c.dead);
  const departed = sum(gone.filter(l => !l.held), c => c.base + c.bonuses);
  const earlier = sum(ended.filter(l => l.replaced), c => c.total);
  const elevated =
    year === league.season.season
      ? [...league.season.elevations.filter(e => e.team === abbr).map(e => e.playerId), ...(change.elevate ? [change.elevate] : [])]
      : [];
  const elevations = elevated.reduce((total, id) => total + elevationCost(league, id), 0);
  const carryover = year === current ? league.teams[abbr].carryover : 0;
  const used = rosterTotal + dead + departed + earlier + elevations;
  return {
    team: abbr,
    year,
    cap: rules.cap.amount,
    carryover,
    lines: [...roster, ...ended],
    offseason,
    roster: rosterTotal,
    dead,
    departed,
    earlier,
    elevations,
    used,
    space: rules.cap.amount + carryover - used
  };
} // prettier-ignore
