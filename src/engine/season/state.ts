/**
 * The season in progress (spec 4.1, 5.3): finished games, playoff seeds, and the champion. Box scores and
 * stat lines live in history storage (spec 9.3); results here are what standings and the bracket need.
 */
import type { ScheduledGame } from '../../data/schedule';
import type { Conference, TeamAbbr } from '../../data/teams';
import type { Transaction } from '../league/transactions';
import type { WeeklyAward } from './awards';
import type { NewsItem, SeasonLine } from './news';
import type { League } from '../league/types';
import type { Phase } from '../model/calendar';
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
  /** Roster moves this season, oldest first (spec 12.1). */
  transactions: Transaction[];
  /** The news feed (spec 18.1), oldest week first. */
  news: NewsItem[];
  /** Players of the week (spec 18.4). */
  awards: WeeklyAward[];
  /** Season totals of the stats the news follows, by player. */
  totals: Record<string, SeasonLine>;
  /**
   * Regular-season games each player's team played while he was on its roster but not active on game
   * day, for per-game roster bonuses (spec 11.2).
   */
  inactive: Record<string, number>;
  /** Practice squad players elevated for a game week (spec 12.1); they revert after that week's game. */
  elevations: { playerId: string; team: TeamAbbr; week: number }[];
}

export const emptySeason = (season: number): SeasonState => ({
  season,
  results: {},
  seeds: null,
  champion: null,
  transactions: [],
  news: [],
  awards: [],
  totals: {},
  inactive: {},
  elevations: []
});

/** Playoff phases in order: round 1 is the Wild Card round, the last is the Super Bowl. */
export const PLAYOFF_PHASES = [
  'wildCard',
  'divisional',
  'conference',
  'superBowl'
] as const satisfies readonly Phase[];

/** The schedule week of a date in the season (playoff rounds follow the regular season's weeks), or null. */
export function scheduleWeek(league: League, date: Pick<League['date'], 'phase' | 'week'>): number | null {
  if (date.phase === 'regularSeason') return date.week;
  const round = (PLAYOFF_PHASES as readonly Phase[]).indexOf(date.phase) + 1;
  return round > 0 ? league.rules.season.weeks + round : null;
}

/** The schedule week the league is in, or null outside the season. */
export const gameWeek = (league: League): number | null => scheduleWeek(league, league.date);

/** This week's games still to play. */
export function weekGames(league: League): ScheduledGame[] {
  const week = gameWeek(league);
  return week === null ? [] : league.schedule.filter(g => g.week === week && !league.season.results[g.id]);
}

/** The coin toss that ends a tie nothing else breaks, fixed for the league and season. */
export const coinSeed = (league: League): number =>
  stream(league.random.baseSeed, 'coinToss', league.season.season).nextU32();

/** Standings from the regular season's finished games (spec 5.3). */
export function leagueStandings(league: League): LeagueStandings {
  const scores = Object.values(league.season.results).filter(g => !g.playoff);
  const { playoffTeamsPerConference, commonGamesMin } = league.rules.season;
  return rankLeague(scores, coinSeed(league), playoffTeamsPerConference, commonGamesMin);
}
