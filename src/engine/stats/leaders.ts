/**
 * League leaderboards and team stats (spec 19.3). Players' regular-season totals come from a season's stat
 * tables or, for careers, from their histories; a board ranks them by a stored stat or a rate, filtered by
 * position and team, and a rate counts only players who reach the NFL's minimums (TUNING.leaders). Team
 * stats sum each club's regular-season games, and its opponents' in them for its defense.
 */
import { TEAM_ABBRS, type TeamAbbr } from '../../data/team-colors';
import { TEAM_KEYS, type PlayerLine, type StatKey, type TeamTotals } from '../sim/stats';
import { TUNING } from '../tuning';
import { addTotals, careerTotals, type PlayerHistory, type Totals } from './aggregate';
import { CATEGORY_IDS, type TableId } from './categories';
import { DERIVED, type DerivedId } from './derived';
import type { GameRecord } from './record';
import { statValue } from './records';
import { kindAt, type StatTable } from './table';

type Minimums = typeof TUNING.leaders.career;

/** The rates a board can rank, each with the count its minimum applies to. */
export const RATE_STATS = {
  completionPct: 'passAtt',
  yardsPerAttempt: 'passAtt',
  adjustedYardsPerAttempt: 'passAtt',
  passerRating: 'passAtt',
  yardsPerCarry: 'rushAtt',
  yardsPerCatch: 'receptions',
  catchRate: 'targets',
  fieldGoalPct: 'fgAtt',
  puntAverage: 'punts',
  netPuntAverage: 'punts',
  kickReturnAverage: 'kickReturns',
  puntReturnAverage: 'puntReturns'
} as const satisfies Partial<Record<DerivedId, keyof Minimums>>;

export type RateStat = keyof typeof RATE_STATS;
export type BoardStat = StatKey | RateStat;

export const isRate = (stat: BoardStat): stat is RateStat => Object.hasOwn(RATE_STATS, stat);

/** One player's totals for the boards. */
export interface PlayerTotals {
  playerId: string;
  /** The last team he played for: in the season, or for a career in his last season. */
  team: TeamAbbr;
  games: number;
  totals: Totals;
}

export interface BoardEntry extends PlayerTotals {
  value: number;
}

/** Each player's regular-season totals in a season's tables, with games played and his latest team. */
export function seasonTotals(tables: Partial<Record<TableId, StatTable>>): PlayerTotals[] {
  const players = new Map<string, PlayerTotals & { seen: Set<string>; last: string }>();
  for (const id of CATEGORY_IDS) {
    const table = tables[id];
    if (!table) continue;
    for (let i = 0; i < table.rows; i++) {
      if (kindAt(table, i) !== 'regular') continue;
      const playerId = table.players[table.player[i] as number] as string;
      const gameId = table.games[table.game[i] as number] as string;
      const team = TEAM_ABBRS[table.team[i] as number] as TeamAbbr;
      let entry = players.get(playerId);
      if (!entry) {
        entry = { playerId, team, games: 0, totals: {}, seen: new Set(), last: gameId };
        players.set(playerId, entry);
      }
      // Game IDs lead with the season and a two-digit week, so the greatest is his latest game.
      if (gameId >= entry.last) {
        entry.last = gameId;
        entry.team = team;
      }
      entry.seen.add(gameId);
      const line: Partial<Record<string, number>> = {};
      for (const f of table.fields) line[f] = (table.columns[f] as Int16Array)[i] as number;
      addTotals(entry.totals, line as Partial<PlayerLine>);
    }
  }
  return [...players.values()].map(({ seen, last: _last, ...rest }) => ({ ...rest, games: seen.size }));
}

/** Each player's regular-season career totals. */
export function careerTotalsOf(histories: readonly PlayerHistory[]): PlayerTotals[] {
  return histories.flatMap(h => {
    const last = h.seasons.at(-1);
    if (!last) return [];
    const career = careerTotals(h);
    return career.games
      ? [{ playerId: h.id, team: last.team, games: career.games, totals: career.totals }]
      : [];
  });
}

/** The count a rate needs: per team game in a season (rounded up), or a career total. */
export function rateMinimum(stat: RateStat, scope: 'season' | 'career', teamGames: number): number {
  const key = RATE_STATS[stat];
  return scope === 'career'
    ? TUNING.leaders.career[key]
    : Math.ceil(TUNING.leaders.perTeamGame[key] * teamGames);
}

export interface BoardOptions {
  /** Only these players count (a position or team filter). */
  keep?: (p: PlayerTotals) => boolean;
  /** A rate's minimum count (see rateMinimum); ignored for stored stats. */
  minimum?: number;
  limit: number;
}

/** Players ranked by a stat, best first; players without it (or short of a rate's minimum) are left out. */
export function leaderboard(players: readonly PlayerTotals[], stat: BoardStat, options: BoardOptions): BoardEntry[] {
  const keep = options.keep ?? (() => true);
  const entries: BoardEntry[] = [];
  for (const p of players) {
    if (!keep(p)) continue;
    let value: number | null;
    if (isRate(stat)) {
      value = (p.totals[RATE_STATS[stat]] ?? 0) >= (options.minimum ?? 0) ? DERIVED[stat](p.totals) : null;
    } else value = statValue(p.totals, stat);
    if (value === null || !Number.isFinite(value) || value <= 0) continue;
    entries.push({ ...p, value });
  }
  entries.sort((a, b) => b.value - a.value || (a.playerId < b.playerId ? -1 : 1));
  return entries.slice(0, options.limit);
} // prettier-ignore

/** A club's regular season: its own totals (offense) and its opponents' (defense). */
export interface TeamSeasonStats {
  team: TeamAbbr;
  games: number;
  pointsFor: number;
  pointsAgainst: number;
  offense: TeamTotals;
  defense: TeamTotals;
}

const zero = (): TeamTotals => Object.fromEntries(TEAM_KEYS.map(k => [k, 0])) as TeamTotals;

/** Every club's regular-season team stats from its games (spec 9.2 team game stats). */
export function teamSeasonStats(games: readonly GameRecord[]): TeamSeasonStats[] {
  const teams = new Map<TeamAbbr, TeamSeasonStats>(
    TEAM_ABBRS.map(team => [team, { team, games: 0, pointsFor: 0, pointsAgainst: 0, offense: zero(), defense: zero() }])
  );
  const add = (into: TeamTotals, from: Readonly<TeamTotals>) => {
    for (const k of TEAM_KEYS) into[k] += from[k] ?? 0;
  };
  for (const g of games) {
    if (g.kind !== 'regular') continue;
    for (const [side, other] of [['home', 'away'], ['away', 'home']] as const) {
      const t = teams.get(g[side]);
      if (!t) continue;
      t.games++;
      t.pointsFor += g.score[side];
      t.pointsAgainst += g.score[other];
      add(t.offense, g.totals[side]);
      add(t.defense, g.totals[other]);
    }
  }
  return [...teams.values()];
} // prettier-ignore
