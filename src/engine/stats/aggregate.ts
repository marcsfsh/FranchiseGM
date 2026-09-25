/**
 * Running aggregates (spec 9.3): player season and career totals, team seasons, league leaders, and the
 * records book (spec 18.5). History screens read these instead of the game logs. Preseason games never
 * count; regular season and playoffs are kept apart.
 */
import type { TeamAbbr } from '../../data/team-colors';
import { LONG_STATS, STAT_KEYS, type PlayerLine, type StatKey, type TeamTotals } from '../sim/stats';
import type { GameKind } from './table';

export type { GameKind };
export type Totals = Partial<Record<StatKey, number>>;

/** A player's stats for one team in one season (regular season or playoffs). */
export interface SeasonLine {
  season: number;
  team: TeamAbbr;
  kind: Exclude<GameKind, 'preseason'>;
  games: number;
  starts: number;
  totals: Totals;
}

export interface PlayerHistory {
  id: string;
  seasons: SeasonLine[];
}

/** Adds a game line into running totals: sums, except "longest" stats, which keep the best game. */
export function addTotals(into: Totals, line: Readonly<Partial<PlayerLine>>): Totals {
  for (const key of STAT_KEYS) {
    const v = line[key] ?? 0;
    if (!v) continue;
    into[key] = LONG_STATS.has(key) ? Math.max(into[key] ?? v, v) : (into[key] ?? 0) + v;
  }
  return into;
}

/** Whether a line shows the player took part: any snap or any stat. */
export const played = (line: Readonly<Partial<PlayerLine>>): boolean =>
  STAT_KEYS.some(key => (line[key] ?? 0) !== 0);

/** A new history with one game added. Preseason games are left out (spec 9.3). */
export function addGame(
  history: PlayerHistory,
  line: Readonly<Partial<PlayerLine>>,
  team: TeamAbbr,
  season: number,
  kind: GameKind
): PlayerHistory {
  if (kind === 'preseason' || !played(line)) return history;
  const seasons = history.seasons.map(s => ({ ...s, totals: { ...s.totals } }));
  let entry = seasons.find(s => s.season === season && s.team === team && s.kind === kind);
  if (!entry) {
    entry = { season, team, kind, games: 0, starts: 0, totals: {} };
    seasons.push(entry);
    seasons.sort((a, b) => a.season - b.season || (a.kind === b.kind ? 0 : a.kind === 'regular' ? -1 : 1));
  }
  entry.games++;
  if (line.started) entry.starts++;
  addTotals(entry.totals, line);
  return { ...history, seasons };
}

/** Career totals, summed over seasons (and teams) of one kind. */
export function careerTotals(history: PlayerHistory, kind: SeasonLine['kind'] = 'regular'): SeasonLine {
  const out: SeasonLine = {
    season: 0,
    team: history.seasons[0]?.team ?? 'MIN',
    kind,
    games: 0,
    starts: 0,
    totals: {}
  };
  for (const s of history.seasons) {
    if (s.kind !== kind) continue;
    out.games += s.games;
    out.starts += s.starts;
    addTotals(out.totals, s.totals);
  }
  return out;
}

/** A team's season: record, points, and summed team game stats (spec 9.2 team game stats). */
export interface TeamSeason {
  season: number;
  team: TeamAbbr;
  kind: Exclude<GameKind, 'preseason'>;
  games: number;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  totals: Partial<TeamTotals>;
}

export function addTeamGame(
  season: TeamSeason,
  totals: Readonly<TeamTotals>,
  pointsFor: number,
  pointsAgainst: number
): TeamSeason {
  const next: TeamSeason = { ...season, totals: { ...season.totals } };
  next.games++;
  if (pointsFor > pointsAgainst) next.wins++;
  else if (pointsFor < pointsAgainst) next.losses++;
  else next.ties++;
  next.pointsFor += pointsFor;
  next.pointsAgainst += pointsAgainst;
  for (const [key, value] of Object.entries(totals) as [keyof TeamTotals, number][])
    next.totals[key] = (next.totals[key] ?? 0) + value;
  return next;
}
