/**
 * The season's transaction log (spec 12.1) and roster lookups the moves share: new IDs, the active roster,
 * free agents, and injured reserve counts. The moves themselves are checked in src/engine/roster/moves.ts.
 */
import type { TeamAbbr } from '../../data/team-colors';
import type { Player } from '../model/player';
import { scheduleWeek } from '../season/state';
import type { League } from './types';

export type TransactionKind =
  | 'injuredReserve'
  /** A return from injured reserve, which uses one of the season's returns. */
  | 'activated'
  /** A return from the PUP or non-football injury list, which doesn't. */
  | 'reserveReturn'
  | 'signed'
  | 'promoted'
  | 'released'
  | 'claimed'
  | 'practiceSquad'
  | 'elevated'
  | 'restructured'
  /** A draft pick joining his team on a rookie deal. */
  | 'drafted'
  /** Re-sign window moves (spec 11.4, 11.5): a deal to follow his current one, and fifth-year options. */
  | 'extended'
  | 'tagged'
  | 'tendered'
  | 'optionExercised'
  | 'optionDeclined';

export interface Transaction {
  season: number;
  phase: League['date']['phase'];
  week: number;
  team: TeamAbbr;
  kind: TransactionKind;
  playerId: string;
  /** Why, in a phrase ("a knee injury, out 6 weeks"), for news and notifications; absent for the user's moves. */
  reason?: string;
}

/** A new ID for a prefix from the league's counters. */
export function newId(league: League, prefix: string): string {
  const n = league.nextId[prefix] ?? 1;
  league.nextId[prefix] = n + 1;
  return `${prefix}${n}`;
}

/** The team's active roster: the players who count against the in-season limit (spec 12.1). */
export const activeRoster = (league: League, abbr: TeamAbbr): Player[] =>
  Object.values(league.players).filter(p => p.team === abbr && p.status === 'active');

/** Free agents available to sign. */
export const freeAgents = (league: League): Player[] =>
  Object.values(league.players).filter(p => p.status === 'freeAgent' && p.team === null);

/**
 * Games the player's team has played since his last placement on injured reserve (spec 12.1: a player
 * placed there misses at least `irMinGames` games, whatever byes fall in between).
 */
export function gamesOnReserve(league: League, player: Player): number {
  const placed = league.season.transactions.findLast(
    t => t.playerId === player.id && t.kind === 'injuredReserve'
  );
  const since = placed ? scheduleWeek(league, placed) : null;
  if (!player.team || since === null) return 0;
  return Object.values(league.season.results).filter(
    g => g.week >= since && (g.home === player.team || g.away === player.team)
  ).length;
}

/** Designated-to-return activations the team has used this season. */
export const irReturnsUsed = (league: League, abbr: TeamAbbr): number =>
  league.season.transactions.filter(t => t.team === abbr && t.kind === 'activated').length;

/** Logs a roster move in the season's transactions, with its reason when one is given. */
export function recordTransaction(
  league: League,
  team: TeamAbbr,
  kind: TransactionKind,
  playerId: string,
  reason?: string
): void {
  const { season, phase, week } = league.date;
  league.season.transactions.push({
    season,
    phase,
    week,
    team,
    kind,
    playerId,
    ...(reason ? { reason } : {})
  });
}
