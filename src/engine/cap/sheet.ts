/**
 * The team cap sheet (spec 11.1, 11.2): every contract's charge to the team's cap in a league year, the
 * dead money from deals that ended, the space left under the cap plus rollover, and, from the start of the
 * league year until the regular season, the rule of 51: only the largest roster charges count.
 */
import type { TeamAbbr } from '../../data/team-colors';
import { capCharge, payWeek, type CapCharge, type CapFacts } from '../contracts/cap';
import type { Contract } from '../contracts/types';
import type { League } from '../league/types';
import { leagueYear } from '../model/calendar';
import type { RosterStatus } from '../model/player';

export interface CapSheetLine {
  playerId: string;
  contractId: string;
  /** The player's roster status for his current deal; null for dead money from a deal that ended. */
  status: RosterStatus | null;
  charge: CapCharge;
  /** Whether it counts against the cap: in the offseason only the largest roster charges do. */
  counts: boolean;
}

export interface CapSheet {
  team: TeamAbbr;
  year: number;
  cap: number;
  /** Unused space carried over from the last league year (spec 11.1). */
  carryover: number;
  /** Roster lines by charge, largest first, then dead money. */
  lines: CapSheetLine[];
  /** Whether the rule of 51 applies: the offseason of the current league year, or a later one. */
  offseason: boolean;
  /** Roster charges that count, and the charges of deals that ended. */
  roster: number;
  dead: number;
  used: number;
  space: number;
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

/** A team's cap sheet for a league year, the current one by default. */
export function capSheet(league: League, abbr: TeamAbbr, year = leagueYear(league.date)): CapSheet {
  const rules = league.rules;
  const offseason = offseasonCount(league, year);
  const roster: CapSheetLine[] = [];
  const dead: CapSheetLine[] = [];
  for (const c of teamContracts(league, abbr)) {
    const charge = capCharge(c, year, rules, capFacts(league, c.playerId));
    const player = league.players[c.playerId];
    const current = !c.ended && player?.contractId === c.id && player.team === abbr;
    if (current) {
      // A deal that doesn't reach this year has nothing to show: he'd be a free agent by then.
      if (charge.total === 0 && !c.years.some(y => y.year === year)) continue;
      roster.push({ playerId: c.playerId, contractId: c.id, status: player.status, charge, counts: true });
    } else if (charge.total !== 0) {
      dead.push({ playerId: c.playerId, contractId: c.id, status: null, charge, counts: true });
    }
  }
  roster.sort((a, b) => b.charge.total - a.charge.total || (a.playerId < b.playerId ? -1 : 1));
  dead.sort((a, b) => b.charge.total - a.charge.total || (a.playerId < b.playerId ? -1 : 1));
  if (offseason) roster.forEach((line, i) => (line.counts = i < rules.cap.offseasonCount));
  const rosterTotal = roster.reduce((sum, l) => sum + (l.counts ? l.charge.total : 0), 0);
  const deadTotal = dead.reduce((sum, l) => sum + l.charge.total, 0);
  const carryover = year === leagueYear(league.date) ? league.teams[abbr].carryover : 0;
  const used = rosterTotal + deadTotal;
  return {
    team: abbr,
    year,
    cap: rules.cap.amount,
    carryover,
    lines: [...roster, ...dead],
    offseason,
    roster: rosterTotal,
    dead: deadTotal,
    used,
    space: rules.cap.amount + carryover - used
  };
}
