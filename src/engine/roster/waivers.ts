/**
 * Waivers (spec 12.1). A released player goes on waivers before he can sign anywhere unless he's a vested
 * veteran released before the trade deadline (practice squad players never do). When the league next
 * advances, teams claim him in waiver priority: the draft order through the early weeks of the season,
 * then the standings, worst record first. The first claimant with room on its active roster and cap space
 * for his salary takes over his contract's remaining years; an unclaimed player becomes a free agent. A
 * claim leaves the old team only the accelerated proration: the guarantees go with the player.
 */
import { TEAM_ABBRS, type TeamAbbr } from '../../data/team-colors';
import { capSheet } from '../cap/sheet';
import { capHit } from '../contracts/cap';
import type { Contract } from '../contracts/types';
import { newId, recordTransaction } from '../league/transactions';
import type { League } from '../league/types';
import { leagueYear, type GameDate } from '../model/calendar';
import { pickJersey } from '../model/jerseys';
import type { Player } from '../model/player';
import { stream, type Rng } from '../rng';
import { leagueStandings, PLAYOFF_PHASES } from '../season/state';
import { winPct } from '../season/standings';
import { activeLimit } from './rules';

export interface WaiverEntry {
  playerId: string;
  /** The team that released him, which can't claim him back. */
  from: TeamAbbr;
  /** The deal he was released from: a claimant takes over its remaining years. */
  contractId: string;
  placed: GameDate;
  /** Teams that put in a claim ahead of processing (the user's); AI teams decide when waivers run. */
  claims: TeamAbbr[];
}

const inPlayoffs = (date: GameDate): boolean => (PLAYOFF_PHASES as readonly string[]).includes(date.phase);

/** Whether the trade deadline has passed: after its week in the regular season, and in the playoffs. */
export const pastTradeDeadline = (league: League): boolean =>
  (league.date.phase === 'regularSeason' && league.date.week > league.rules.season.tradeDeadlineWeek) ||
  inPlayoffs(league.date);

/** Whether releasing this player puts him on waivers. */
export function subjectToWaivers(league: League, player: Player): boolean {
  if (player.status === 'practice') return false;
  return player.experience < league.rules.roster.vestedVeteranSeasons || pastTradeDeadline(league);
}

/**
 * Waiver priority, first claim first: the standings from the early weeks' end on (worst winning
 * percentage, then the weaker schedule, as the draft order breaks ties), and before that the draft order.
 * Until the draft order exists (M11), a seeded order for the league and season stands in; it also breaks
 * any tie left in the standings.
 */
export function waiverOrder(league: League): TeamAbbr[] {
  const rng = stream(league.random.baseSeed, 'waivers', league.season.season);
  const seeded = [...TEAM_ABBRS]
    .map(abbr => ({ abbr, key: rng.float() }))
    .sort((a, b) => a.key - b.key)
    .map(t => t.abbr);
  const byStandings =
    (league.date.phase === 'regularSeason' && league.date.week > league.rules.roster.waiverDraftOrderWeeks) ||
    inPlayoffs(league.date);
  if (!byStandings) return seeded;
  const records = leagueStandings(league).table.records;
  const rank = new Map(seeded.map((abbr, i) => [abbr, i]));
  // A team that hasn't played yet sits at .500.
  const pct = (abbr: TeamAbbr) => {
    const r = records[abbr].overall;
    return r.wins + r.losses + r.ties ? winPct(r) : 0.5;
  };
  return [...TEAM_ABBRS].sort(
    (a, b) => pct(a) - pct(b) || records[a].sos - records[b].sos || (rank.get(a) ?? 0) - (rank.get(b) ?? 0)
  );
}

/** Puts a released player on waivers; his released contract stays for its dead money. */
export function placeOnWaivers(league: League, player: Player, from: TeamAbbr, contractId: string): void {
  league.waivers.push({ playerId: player.id, from, contractId, placed: { ...league.date }, claims: [] });
  player.team = null;
  player.status = 'waivers';
  player.contractId = null;
}

/**
 * The contract a claiming team takes over: the released deal's years from this league year on, void years
 * and proration left behind, starting on the claim date.
 */
export function claimedContract(old: Contract, team: TeamAbbr, id: string, date: GameDate): Contract {
  const year = leagueYear(date);
  const years = old.years.filter(y => y.year >= year && !y.isVoid);
  const kept = new Set(years.map(y => y.year));
  return {
    ...old,
    id,
    team,
    signed: { ...date },
    years,
    signingBonus: 0,
    signingBonusYears: null,
    vesting: old.vesting.filter(v => kept.has(v.year)),
    restructures: [],
    ended: null
  };
}

/** Why a team can't claim a player now, or null if it can: room on the active roster and cap space. */
export function claimProblem(league: League, abbr: TeamAbbr, entry: WaiverEntry): string | null {
  if (abbr === entry.from) return "A team can't claim a player it released.";
  const active = Object.values(league.players).filter(p => p.team === abbr && p.status === 'active').length;
  if (active >= activeLimit(league)) return 'The active roster is full.';
  const old = league.contracts[entry.contractId];
  if (!old) return 'The contract is missing.';
  const charge = capHit(
    claimedContract(old, abbr, 'preview', league.date),
    leagueYear(league.date),
    league.rules
  );
  if (charge > capSheet(league, abbr).space) return "There isn't enough cap space for his salary.";
  return null;
}

export interface WaiverResult {
  playerId: string;
  from: TeamAbbr;
  /** The team that claimed him, or null if he cleared waivers to free agency. */
  claimedBy: TeamAbbr | null;
}

/**
 * Runs the waiver wire: every player on it goes to the first team in priority that claimed him and can take
 * him, or to free agency. `aiClaims` lists the AI teams that claim a player.
 */
export function processWaivers(
  league: League,
  rng: Rng,
  aiClaims: (entry: WaiverEntry, player: Player) => TeamAbbr[] = () => []
): WaiverResult[] {
  const order = waiverOrder(league);
  const results: WaiverResult[] = [];
  const entries = league.waivers;
  league.waivers = [];
  for (const entry of entries) {
    const player = league.players[entry.playerId];
    const old = league.contracts[entry.contractId];
    if (!player || !old) continue;
    const claimants = new Set([...entry.claims, ...aiClaims(entry, player)]);
    const winner =
      order.find(abbr => claimants.has(abbr) && claimProblem(league, abbr, entry) === null) ?? null;
    if (winner) {
      if (old.ended) league.contracts[old.id] = { ...old, ended: { ...old.ended, how: 'claimed' } };
      const contract = claimedContract(old, winner, newId(league, 'c'), league.date);
      league.contracts[contract.id] = contract;
      const taken = new Set(
        Object.values(league.players)
          .filter(p => p.team === winner)
          .map(p => p.jersey)
      );
      if (taken.has(player.jersey))
        player.jersey = pickJersey(player.position, taken, t => rng.float() * t) ?? 0;
      player.team = winner;
      player.status = 'active';
      player.contractId = contract.id;
      recordTransaction(league, winner, 'claimed', player.id);
    } else {
      player.status = 'freeAgent';
    }
    results.push({ playerId: player.id, from: entry.from, claimedBy: winner });
  }
  return results;
}
