/**
 * The season in progress (spec 4.1, 5.3): finished games, playoff seeds, and the champion. Box scores and
 * stat lines live in history storage (spec 9.3); results here are what standings and the bracket need.
 */
import type { Conference, TeamAbbr } from '../../data/teams';
import type { League } from '../league/types';
import { stream } from '../rng';
import { rankLeague, type GameScore, type LeagueStandings } from './standings';

export interface GameOutcome extends GameScore {
  id: string;
  playoff: boolean;
  overtime: boolean;
}

export interface SeasonState {
  season: number;
  /** Finished games by ID, regular season and playoffs. */
  results: Record<string, GameOutcome>;
  /** Each conference's playoff seeds, best first, once the regular season ends. */
  seeds: Record<Conference, TeamAbbr[]> | null;
  champion: TeamAbbr | null;
}

export const emptySeason = (season: number): SeasonState => ({
  season,
  results: {},
  seeds: null,
  champion: null
});

/** The coin toss that ends a tie nothing else breaks, fixed for the league and season. */
export const coinSeed = (league: League): number =>
  stream(league.random.baseSeed, 'coinToss', league.season.season).nextU32();

/** Standings from the regular season's finished games (spec 5.3). */
export function leagueStandings(league: League): LeagueStandings {
  const scores = Object.values(league.season.results).filter(g => !g.playoff);
  return rankLeague(scores, coinSeed(league), league.rules.season.playoffTeamsPerConference);
}
