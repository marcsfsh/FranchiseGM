/**
 * Recording games into history (spec 9.1, 9.3): a finished game becomes stat rows for each category table,
 * a game record kept forever, and updates to the running aggregates.
 */
import { TEAM_ABBRS, type TeamAbbr } from '../../data/team-colors';
import type { GameResult, Side } from '../sim/types';
import type { PlayerLine, StatKey, TeamTotals } from '../sim/stats';
import {
  CATEGORY_IDS,
  CATEGORY_KEYS,
  penaltyIndex,
  TABLE_IDS,
  tableFields,
  type TableId
} from './categories';
import {
  addGame,
  addTeamGame,
  addTotals,
  careerTotals,
  played,
  type GameKind,
  type PlayerHistory,
  type SeasonLine,
  type TeamSeason,
  type Totals
} from './aggregate';
import {
  addGameRecords,
  addPlayerRecords,
  addTeamRecords,
  statValue,
  type BrokenRecord,
  type RecordsBook
} from './records';
import { appendRows, emptyTable, kindAt, readRow, type StatRow, type StatTable } from './table';

export interface GameMeta {
  season: number;
  week: number;
  kind: GameKind;
}

/** Everything about a game except player lines, which live in the stat tables (spec 9.1). */
export type GameRecord = Omit<GameResult, 'box' | 'situations' | 'penalties'> &
  GameMeta & { totals: { home: TeamTotals; away: TeamTotals } };

export function gameRecord(result: GameResult, meta: GameMeta): GameRecord {
  const { box, situations: _s, penalties: _p, ...rest } = result;
  return { ...rest, ...meta, totals: { home: box.home.totals, away: box.away.totals } };
}

/** A game's rows for each table: one per player per category he has stats in, one per accepted foul. */
export function gameRows(result: GameResult, meta: GameMeta): Record<TableId, StatRow[]> {
  const rows = Object.fromEntries(TABLE_IDS.map(id => [id, [] as StatRow[]])) as Record<TableId, StatRow[]>;
  const kind = meta.kind;
  for (const side of ['home', 'away'] as const) {
    const team = result[side];
    for (const [playerId, line] of Object.entries(result.box[side].players)) {
      for (const category of CATEGORY_IDS) {
        const keys = CATEGORY_KEYS[category];
        if (!keys.some(k => line[k] !== 0)) continue;
        const values: Record<string, number> = {};
        for (const k of keys) values[k] = line[k];
        rows[category].push({ playerId, gameId: result.id, team, kind, values });
      }
    }
  }
  for (const p of result.penalties)
    rows.penalties.push({
      playerId: p.playerId,
      gameId: result.id,
      team: p.team,
      kind,
      values: { penaltyType: penaltyIndex(p.penalty), penaltyYds: p.yards }
    });
  return rows;
}

/** A game's result in a season summary, enough for game logs and schedules. */
export interface ResultLine {
  id: string;
  week: number;
  kind: GameKind;
  home: TeamAbbr;
  away: TeamAbbr;
  homeScore: number;
  awayScore: number;
  overtime: boolean;
}

export const LEADER_STATS = [
  'passYds', 'passTd', 'rushYds', 'rushTd', 'receptions', 'recYds', 'recTd', 'tackles', 'sacks', 'defInt',
  'passesDefended', 'forcedFumbles', 'fgMade', 'kickReturnYds', 'puntReturnYds'
] as const satisfies readonly StatKey[]; // prettier-ignore
export type LeaderStat = (typeof LEADER_STATS)[number];
export const LEADER_DEPTH = 10;

export interface Leader {
  playerId: string;
  team: TeamAbbr;
  value: number;
}

/** One season's running aggregates: team seasons, results, and league leaders (regular season). */
export interface SeasonSummary {
  season: number;
  teams: TeamSeason[];
  results: ResultLine[];
  leaders: Partial<Record<LeaderStat, Leader[]>>;
}

export const emptySeason = (season: number): SeasonSummary => ({
  season,
  teams: [],
  results: [],
  leaders: {}
});

/** What the caller loads before recording a batch of one season's games. */
export interface HistoryState {
  tables: Partial<Record<TableId, StatTable>>;
  /** Histories of every player in the batch that has one; the rest start empty. */
  players: ReadonlyMap<string, PlayerHistory>;
  season: SeasonSummary;
  records: RecordsBook;
}

/** What recording writes back. */
export interface HistoryPatch {
  tables: Record<TableId, StatTable>;
  games: GameRecord[];
  players: PlayerHistory[];
  season: SeasonSummary;
  records: RecordsBook;
  /** Records that changed hands, for the news feed. */
  broken: BrokenRecord[];
}

const other = (side: Side): Side => (side === 'home' ? 'away' : 'home');

const emptyTeamSeason = (season: number, team: TeamAbbr, kind: TeamSeason['kind']): TeamSeason => ({
  season,
  team,
  kind,
  games: 0,
  wins: 0,
  losses: 0,
  ties: 0,
  pointsFor: 0,
  pointsAgainst: 0,
  totals: {}
});

/** A player's regular season across every team he played for, for season records. */
function wholeSeason(history: PlayerHistory, season: number): SeasonLine | null {
  const lines = history.seasons.filter(s => s.season === season && s.kind === 'regular');
  if (!lines.length) return null;
  const out: SeasonLine = {
    season,
    team: (lines.at(-1) as SeasonLine).team,
    kind: 'regular',
    games: 0,
    starts: 0,
    totals: {}
  };
  for (const l of lines) {
    out.games += l.games;
    out.starts += l.starts;
    addTotals(out.totals, l.totals);
  }
  return out;
}

/** League leaders from a season's tables: regular-season totals across teams, the best LEADER_DEPTH. */
export function seasonLeaders(tables: Partial<Record<TableId, StatTable>>): SeasonSummary['leaders'] {
  const totals = new Map<string, { team: TeamAbbr; totals: Totals }>();
  const needed = new Set<StatKey>([...LEADER_STATS, 'soloTackles', 'assistedTackles']);
  for (const id of CATEGORY_IDS) {
    const t = tables[id];
    if (!t) continue;
    const fields = t.fields.filter(f => needed.has(f as StatKey)) as StatKey[];
    if (!fields.length) continue;
    for (let i = 0; i < t.rows; i++) {
      if (kindAt(t, i) !== 'regular') continue;
      const pid = t.players[t.player[i] as number] as string;
      let entry = totals.get(pid);
      if (!entry) {
        entry = { team: 'MIN', totals: {} };
        totals.set(pid, entry);
      }
      entry.team = TEAM_ABBRS[t.team[i] as number] as TeamAbbr;
      for (const f of fields)
        entry.totals[f] = (entry.totals[f] ?? 0) + ((t.columns[f] as Int16Array)[i] as number);
    }
  }
  const out: SeasonSummary['leaders'] = {};
  for (const stat of LEADER_STATS) {
    out[stat] = [...totals]
      .map(([playerId, e]) => ({ playerId, team: e.team, value: statValue(e.totals, stat) }))
      .filter(l => l.value > 0)
      .sort((a, b) => b.value - a.value || a.playerId.localeCompare(b.playerId))
      .slice(0, LEADER_DEPTH);
  }
  return out;
}

/**
 * Records a batch of one season's games (spec 9.3): their rows join the season's tables, and player and
 * team aggregates, leaders, and the records book update. Returns everything to write back; the state
 * passed in is left unchanged.
 */
export function recordGames(
  state: HistoryState,
  games: readonly { result: GameResult; meta: GameMeta }[]
): HistoryPatch {
  const season = state.season.season;
  const batch = Object.fromEntries(TABLE_IDS.map(id => [id, [] as StatRow[]])) as Record<TableId, StatRow[]>;
  for (const g of games) {
    if (g.meta.season !== season) throw new Error(`Game ${g.result.id} isn't in the ${season} season.`);
    const rows = gameRows(g.result, g.meta);
    for (const id of TABLE_IDS) batch[id].push(...rows[id]);
  }
  const tables = Object.fromEntries(
    TABLE_IDS.map(id => [
      id,
      appendRows(state.tables[id] ?? emptyTable(season, id, tableFields(id)), batch[id])
    ])
  ) as Record<TableId, StatTable>;

  const players = new Map(state.players);
  const touched = new Set<string>();
  const records = structuredClone(state.records);
  const broken: BrokenRecord[] = [];
  const summary: SeasonSummary = {
    ...state.season,
    teams: [...state.season.teams],
    results: [...state.season.results]
  };
  for (const { result, meta } of games) {
    const counted = meta.kind !== 'preseason';
    const lines: { playerId: string; team: TeamAbbr; line: PlayerLine }[] = [];
    for (const side of ['home', 'away'] as const) {
      const team = result[side];
      for (const [playerId, line] of Object.entries(result.box[side].players)) {
        if (!played(line)) continue;
        lines.push({ playerId, team, line });
        if (!counted) continue;
        players.set(
          playerId,
          addGame(players.get(playerId) ?? { id: playerId, seasons: [] }, line, team, season, meta.kind)
        );
        touched.add(playerId);
      }
      if (!counted) continue;
      const kind = meta.kind as TeamSeason['kind'];
      const at = summary.teams.findIndex(t => t.team === team && t.kind === kind);
      const before = at >= 0 ? (summary.teams[at] as TeamSeason) : emptyTeamSeason(season, team, kind);
      const pointsFor = result.score[side];
      const pointsAgainst = result.score[other(side)];
      const next = addTeamGame(before, result.box[side].totals, pointsFor, pointsAgainst);
      if (at >= 0) summary.teams[at] = next;
      else summary.teams.push(next);
      if (kind === 'regular')
        addTeamRecords(
          records,
          { gameId: result.id, season, team, points: pointsFor, won: pointsFor > pointsAgainst },
          next.wins,
          next.pointsFor,
          broken
        );
    }
    if (counted && meta.kind === 'regular') addGameRecords(records, lines, season, result.id, broken);
    summary.results.push({
      id: result.id,
      week: meta.week,
      kind: meta.kind,
      home: result.home,
      away: result.away,
      homeScore: result.score.home,
      awayScore: result.score.away,
      overtime: result.overtime
    });
  }
  const changed = [...touched].map(id => players.get(id) as PlayerHistory);
  addPlayerRecords(
    records,
    changed.map(h => ({
      id: h.id,
      season: wholeSeason(h, season),
      career: careerTotals(h),
      lastSeason: season
    })),
    broken
  );
  summary.leaders = seasonLeaders(tables);
  return {
    tables,
    games: games.map(g => gameRecord(g.result, g.meta)),
    players: changed,
    season: summary,
    records,
    broken
  };
}

/** One game in a player's game log: the game, his team's result, and his line across categories. */
export interface GameLogEntry {
  gameId: string;
  week: number;
  kind: GameKind;
  team: TeamAbbr;
  opponent: TeamAbbr | null;
  home: boolean;
  teamScore: number;
  opponentScore: number;
  overtime: boolean;
  line: Totals;
  /** Accepted fouls: the foul's position in PENALTY_IDS and the yards. */
  penalties: { type: number; yards: number }[];
}

/**
 * A player's game-by-game log for one season, from that season's tables and results (spec 9.3). `index`
 * gives each table's rows by player; it is built once when a season loads.
 */
export function gameLog(
  playerId: string,
  tables: Partial<Record<TableId, StatTable>>,
  index: (id: TableId, table: StatTable) => ReadonlyMap<string, readonly number[]>,
  summary: SeasonSummary | null
): GameLogEntry[] {
  const results = new Map((summary?.results ?? []).map(r => [r.id, r]));
  const entries = new Map<string, GameLogEntry>();
  for (const id of TABLE_IDS) {
    const table = tables[id];
    if (!table) continue;
    for (const i of index(id, table).get(playerId) ?? []) {
      const row = readRow(table, i);
      let entry = entries.get(row.gameId);
      if (!entry) {
        const r = results.get(row.gameId);
        const home = r ? r.home === row.team : false;
        entry = {
          gameId: row.gameId,
          week: r?.week ?? 0,
          kind: row.kind,
          team: row.team,
          opponent: r ? (home ? r.away : r.home) : null,
          home,
          teamScore: r ? (home ? r.homeScore : r.awayScore) : 0,
          opponentScore: r ? (home ? r.awayScore : r.homeScore) : 0,
          overtime: r?.overtime ?? false,
          line: {},
          penalties: []
        };
        entries.set(row.gameId, entry);
      }
      if (id === 'penalties')
        entry.penalties.push({ type: row.values.penaltyType ?? 0, yards: row.values.penaltyYds ?? 0 });
      else Object.assign(entry.line, row.values);
    }
  }
  const order: Record<GameKind, number> = { preseason: 0, regular: 1, playoffs: 2 };
  return [...entries.values()].sort((a, b) => order[a.kind] - order[b.kind] || a.week - b.week);
}
