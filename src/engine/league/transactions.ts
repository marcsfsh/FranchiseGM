/**
 * Roster transactions in season (spec 12.1): injured reserve, activations, free agent signings, and
 * releases, each recorded in the season's transaction log for the news feed. M8 brings the full contract
 * model, cap previews, and waivers; until then an in-season signing is a one-year minimum deal and a
 * released player's contract simply ends.
 */
import type { TeamAbbr } from '../../data/team-colors';
import { minimumContract } from '../contracts/build';
import { pickJersey } from '../model/jerseys';
import type { Player } from '../model/player';
import type { Rng } from '../rng';
import { scheduleWeek } from '../season/state';
import type { League } from './types';

export type TransactionKind = 'injuredReserve' | 'activated' | 'signed' | 'promoted' | 'released';

export interface Transaction {
  season: number;
  phase: League['date']['phase'];
  week: number;
  team: TeamAbbr;
  kind: TransactionKind;
  playerId: string;
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

function record(league: League, team: TeamAbbr, kind: TransactionKind, playerId: string): void {
  const { season, phase, week } = league.date;
  league.season.transactions.push({ season, phase, week, team, kind, playerId });
}

export function placeOnInjuredReserve(league: League, player: Player): void {
  if (!player.team || player.status !== 'active') throw new Error(`${player.id} isn't on an active roster.`);
  player.status = 'ir';
  record(league, player.team, 'injuredReserve', player.id);
}

export function activateFromInjuredReserve(league: League, player: Player): void {
  if (!player.team || player.status !== 'ir') throw new Error(`${player.id} isn't on injured reserve.`);
  player.status = 'active';
  record(league, player.team, 'activated', player.id);
}

/** Signs a free agent to a one-year minimum deal and gives him a free jersey number for his position. */
export function signFreeAgent(league: League, abbr: TeamAbbr, player: Player, rng: Rng): void {
  if (player.status !== 'freeAgent' || player.team) throw new Error(`${player.id} isn't a free agent.`);
  const season = league.date.season;
  const contract = {
    ...minimumContract(league.rules, { id: newId(league, 'c'), playerId: player.id, team: abbr }, season, player.experience),
    signed: { ...league.date }
  }; // prettier-ignore
  league.contracts[contract.id] = contract;
  const taken = new Set(
    Object.values(league.players)
      .filter(p => p.team === abbr && p.id !== player.id)
      .map(p => p.jersey)
  );
  if (taken.has(player.jersey)) player.jersey = pickJersey(player.position, taken, t => rng.float() * t) ?? 0;
  player.team = abbr;
  player.status = 'active';
  player.contractId = contract.id;
  record(league, abbr, 'signed', player.id);
}

/** Promotes a practice squad player to the active roster on a one-year minimum deal. */
export function promoteFromPracticeSquad(league: League, player: Player): void {
  const team = player.team;
  if (!team || player.status !== 'practice') throw new Error(`${player.id} isn't on a practice squad.`);
  if (player.contractId) delete league.contracts[player.contractId];
  const season = league.date.season;
  const contract = {
    ...minimumContract(league.rules, { id: newId(league, 'c'), playerId: player.id, team }, season, player.experience),
    signed: { ...league.date }
  }; // prettier-ignore
  league.contracts[contract.id] = contract;
  player.contractId = contract.id;
  player.status = 'active';
  record(league, team, 'promoted', player.id);
}

/** Releases a player to free agency; his contract ends (dead money comes with M8's cap accounting). */
export function releasePlayer(league: League, player: Player): void {
  const team = player.team;
  if (!team) throw new Error(`${player.id} isn't on a team.`);
  if (player.contractId) delete league.contracts[player.contractId];
  player.contractId = null;
  player.team = null;
  player.status = 'freeAgent';
  record(league, team, 'released', player.id);
}
