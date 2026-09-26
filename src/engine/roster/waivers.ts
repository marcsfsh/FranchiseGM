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
import { afterJune1, leagueYearStart } from '../contracts/cap';
import { endPending } from '../contracts/resign';
import type { Contract } from '../contracts/types';
import { newId, recordTransaction } from '../league/transactions';
import type { League } from '../league/types';
import { compareDates, leagueYear, type GameDate } from '../model/calendar';
import { pickJersey } from '../model/jerseys';
import type { Player } from '../model/player';
import type { Rng } from '../rng';
import type { RuleSet } from '../rules/ruleset';
import { leagueStandings, PLAYOFF_PHASES } from '../season/state';
import { winPct } from '../season/standings';
import { activeLimit } from './rules';
import { latestDraftOrder } from '../draft/picks';

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
  return player.accrued < league.rules.roster.vestedVeteranSeasons || pastTradeDeadline(league);
}

/**
 * Waiver priority, first claim first: the standings from the early weeks' end on (worst winning
 * percentage, then the weaker schedule, as the draft order breaks ties), and before that the latest
 * draft's order (D-42). In a league's first season, before any draft has been ordered, a seeded order
 * stands in, drawn from `seeded`, a stream fixed for the league and season (D-22).
 */
export function waiverOrder(league: League, seeded: Rng): TeamAbbr[] {
  const seededOrder = [...TEAM_ABBRS]
    .map(abbr => ({ abbr, key: seeded.float() }))
    .sort((a, b) => a.key - b.key)
    .map(t => t.abbr);
  const draftOrder = latestDraftOrder(league) ?? seededOrder;
  const byStandings =
    (league.date.phase === 'regularSeason' && league.date.week > league.rules.roster.waiverDraftOrderWeeks) ||
    inPlayoffs(league.date);
  if (!byStandings) return draftOrder;
  const records = leagueStandings(league).table.records;
  const rank = new Map(draftOrder.map((abbr, i) => [abbr, i]));
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
  player.lastTeam = from;
  player.status = 'waivers';
  player.contractId = null;
}

/**
 * The contract a claiming team takes over: the released deal's years from this league year on, void years
 * and proration left behind, starting on the claim date. Bonuses the old deal already earned stay with the
 * team that released him: this year's roster bonus once the league year opened, its workout bonus after
 * June 1, and exercised option bonuses, which it paid and prorated.
 */
export function claimedContract(
  old: Contract,
  team: TeamAbbr,
  id: string,
  date: GameDate,
  rules: RuleSet
): Contract {
  const year = leagueYear(date);
  const released = old.ended?.date ?? date;
  const thisYear = leagueYear(released) === year;
  const years = old.years
    .filter(y => y.year >= year && !y.isVoid)
    .map(y => ({
      ...y,
      rosterBonus: y.year === year && thisYear && compareDates(released, leagueYearStart(year)) > 0 ? 0 : y.rosterBonus,
      workoutBonus: y.year === year && thisYear && afterJune1(released, rules) ? 0 : y.workoutBonus,
      optionBonus: y.optionExercised ? 0 : y.optionBonus,
      optionBonusYears: y.optionExercised ? null : y.optionBonusYears
    })); // prettier-ignore
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

/**
 * Why a team can't claim a player now, or null if it can: room on the active roster (unless it will cut
 * someone to make room) and cap space, which a claim must leave it under (D-46). With `enforce` off (the
 * user's claims when the league's rule enforcement is off) only the release rule applies.
 */
export function claimProblem(
  league: League,
  abbr: TeamAbbr,
  entry: WaiverEntry,
  makesRoom = false,
  enforce = true
): string | null {
  if (abbr === entry.from) return "A team can't claim a player it released.";
  const old = league.contracts[entry.contractId];
  if (!old) return 'The contract is missing.';
  if (!enforce) return null;
  const active = Object.values(league.players).filter(p => p.team === abbr && p.status === 'active').length;
  if (active >= activeLimit(league) && !makesRoom) return 'The active roster is full.';
  const contract = claimedContract(old, abbr, 'preview', league.date, league.rules);
  const after = capSheet(league, abbr, leagueYear(league.date), {
    add: [{ contract, status: 'active' }]
  }).space;
  if (after < 0) return "There isn't enough cap space for his salary.";
  return null;
}

export interface WaiverResult {
  playerId: string;
  from: TeamAbbr;
  /** The team that claimed him, or null if he cleared waivers to free agency. */
  claimedBy: TeamAbbr | null;
  /** Every team that put in a claim. */
  claims: TeamAbbr[];
}

/**
 * Runs the waiver wire: every player on it goes to the first team in priority (`order`, from waiverOrder)
 * that claimed him and can take him, or to free agency. `aiClaims` lists the AI teams that claim a player.
 */
export function processWaivers(
  league: League,
  rng: Rng,
  order: readonly TeamAbbr[],
  aiClaims: (entry: WaiverEntry, player: Player) => TeamAbbr[] = () => []
): WaiverResult[] {
  const results: WaiverResult[] = [];
  const entries = league.waivers;
  league.waivers = [];
  for (const entry of entries) {
    const player = league.players[entry.playerId];
    const old = league.contracts[entry.contractId];
    if (!player || !old) continue;
    // AI claimants cut someone before their next game if the claim fills their roster.
    const ai = new Set(aiClaims(entry, player));
    const claimants = new Set([...entry.claims, ...ai]);
    // The user's claims follow the league's rule enforcement; the AI's always follow the rules.
    const enforced = (abbr: TeamAbbr) => ai.has(abbr) || abbr !== league.meta.start.userTeam || league.settings.commissioner.enforceRules; // prettier-ignore
    const winner =
      order.find(
        abbr =>
          claimants.has(abbr) && claimProblem(league, abbr, entry, ai.has(abbr), enforced(abbr)) === null
      ) ?? null;
    if (winner) {
      if (old.ended) league.contracts[old.id] = { ...old, ended: { ...old.ended, how: 'claimed' } };
      // A deal he'd signed to follow this one doesn't go with him.
      if (old.ended) endPending(league, player, { ...old.ended, how: 'replaced' });
      const contract = claimedContract(old, winner, newId(league, 'c'), league.date, league.rules);
      league.contracts[contract.id] = contract;
      const taken = new Set(
        Object.values(league.players)
          .filter(p => p.team === winner)
          .map(p => p.jersey)
      );
      if (taken.has(player.jersey))
        player.jersey = pickJersey(player.position, taken, t => rng.float() * t) ?? 0;
      player.team = winner;
      player.joined = leagueYear(league.date);
      player.status = 'active';
      player.contractId = contract.id;
      recordTransaction(league, winner, 'claimed', player.id);
    } else {
      player.status = 'freeAgent';
    }
    results.push({ playerId: player.id, from: entry.from, claimedBy: winner, claims: [...claimants] });
  }
  return results;
}
