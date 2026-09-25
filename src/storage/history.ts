/**
 * History storage (spec 9.1, 9.3): each league's stat tables (one record per season per category), game
 * records kept forever, player histories, season summaries, and the records book, in IndexedDB beside the
 * league save. When the browser blocks IndexedDB, history lives in memory for the session.
 */
import { TABLE_IDS, type TableId } from '../engine/stats/categories';
import type { PlayerHistory } from '../engine/stats/aggregate';
import {
  emptySeason,
  gameLog,
  recordGames,
  type GameLogEntry,
  type GameMeta,
  type GameRecord,
  type SeasonSummary
} from '../engine/stats/record';
import { emptyRecords, type BrokenRecord, type RecordsBook } from '../engine/stats/records';
import {
  decodeTable,
  encodeTable,
  indexByPlayer,
  type EncodedTable,
  type StatTable
} from '../engine/stats/table';
import type { GameResult } from '../engine/sim/types';
import type { BatchOp, Db } from './idb';

export const HISTORY_STORES = ['statTables', 'gameRecords', 'playerHistory', 'seasons', 'records'] as const;
type HistoryStoreName = (typeof HISTORY_STORES)[number];

/** Every key of a league in a store keyed by [leagueId, ...]. */
const leagueRange = (leagueId: string): IDBKeyRange => IDBKeyRange.bound([leagueId], [leagueId, []]);

/** A league's whole history, for export files (spec 21). Stat tables travel base64-encoded. */
export interface HistoryExport {
  tables: EncodedTable[];
  games: GameRecord[];
  players: PlayerHistory[];
  seasons: SeasonSummary[];
  records: RecordsBook | null;
}

export class HistoryStore {
  /** The last loaded season's tables and player index, reused by game logs and the next batch. */
  private cache: {
    leagueId: string;
    season: number;
    tables: Partial<Record<TableId, StatTable>>;
    index: Map<TableId, Map<string, number[]>>;
  } | null = null;
  private readonly memory = new Map<string, unknown>();

  constructor(private readonly db: Db | null) {}

  private key(store: HistoryStoreName, key: IDBValidKey): string {
    return `${store}|${JSON.stringify(key)}`;
  }

  private async get<T>(store: HistoryStoreName, key: IDBValidKey): Promise<T | undefined> {
    if (this.db) return this.db.get<T>(store, key);
    return this.memory.get(this.key(store, key)) as T | undefined;
  }

  private async getMany<T>(
    store: HistoryStoreName,
    keys: readonly IDBValidKey[]
  ): Promise<(T | undefined)[]> {
    if (this.db) return this.db.getMany<T>(store, keys);
    return keys.map(k => this.memory.get(this.key(store, k)) as T | undefined);
  }

  private async write(ops: { store: HistoryStoreName; key: IDBValidKey; value: unknown }[]): Promise<void> {
    if (this.db) {
      await this.db.batch(
        ops.map((op): BatchOp => ({ type: 'put', store: op.store, key: op.key, value: op.value }))
      );
      return;
    }
    for (const op of ops) this.memory.set(this.key(op.store, op.key), structuredClone(op.value));
  }

  private async seasonTables(leagueId: string, season: number): Promise<Partial<Record<TableId, StatTable>>> {
    if (this.cache?.leagueId === leagueId && this.cache.season === season) return this.cache.tables;
    const found = await this.getMany<StatTable>(
      'statTables',
      TABLE_IDS.map(id => [leagueId, season, id])
    );
    const tables: Partial<Record<TableId, StatTable>> = {};
    TABLE_IDS.forEach((id, i) => {
      const t = found[i];
      if (t) tables[id] = t;
    });
    this.cache = { leagueId, season, tables, index: new Map() };
    return tables;
  }

  /**
   * Records a batch of one season's games: appends their stat rows and updates every running aggregate in
   * one transaction. Returns records that changed hands.
   */
  async record(
    leagueId: string,
    games: readonly { result: GameResult; meta: GameMeta }[]
  ): Promise<BrokenRecord[]> {
    if (!games.length) return [];
    const season = (games[0] as { meta: GameMeta }).meta.season;
    const tables = await this.seasonTables(leagueId, season);
    const ids = [
      ...new Set(
        games.flatMap(g => [
          ...Object.keys(g.result.box.home.players),
          ...Object.keys(g.result.box.away.players)
        ])
      )
    ];
    const histories = await this.getMany<PlayerHistory>(
      'playerHistory',
      ids.map(id => [leagueId, id])
    );
    const players = new Map<string, PlayerHistory>();
    histories.forEach(h => {
      if (h) players.set(h.id, h);
    });
    const summary = (await this.get<SeasonSummary>('seasons', [leagueId, season])) ?? emptySeason(season);
    const records = (await this.get<RecordsBook>('records', leagueId)) ?? emptyRecords();
    const patch = recordGames({ tables, players, season: summary, records }, games);
    await this.write([
      ...TABLE_IDS.map(id => ({
        store: 'statTables' as const,
        key: [leagueId, season, id],
        value: patch.tables[id]
      })),
      ...patch.games.map(g => ({ store: 'gameRecords' as const, key: [leagueId, g.id], value: g })),
      ...patch.players.map(p => ({ store: 'playerHistory' as const, key: [leagueId, p.id], value: p })),
      { store: 'seasons', key: [leagueId, season], value: patch.season },
      { store: 'records', key: leagueId, value: patch.records }
    ]);
    this.cache = { leagueId, season, tables: patch.tables, index: new Map() };
    return patch.broken;
  }

  private indexFor(id: TableId, table: StatTable): Map<string, number[]> {
    const cache = this.cache;
    if (!cache || cache.tables[id] !== table) return indexByPlayer(table);
    let index = cache.index.get(id);
    if (!index) {
      index = indexByPlayer(table);
      cache.index.set(id, index);
    }
    return index;
  }

  async playerHistory(leagueId: string, playerId: string): Promise<PlayerHistory | null> {
    return (await this.get<PlayerHistory>('playerHistory', [leagueId, playerId])) ?? null;
  }

  async season(leagueId: string, season: number): Promise<SeasonSummary | null> {
    return (await this.get<SeasonSummary>('seasons', [leagueId, season])) ?? null;
  }

  async records(leagueId: string): Promise<RecordsBook> {
    return (await this.get<RecordsBook>('records', leagueId)) ?? emptyRecords();
  }

  async game(leagueId: string, gameId: string): Promise<GameRecord | null> {
    return (await this.get<GameRecord>('gameRecords', [leagueId, gameId])) ?? null;
  }

  /** Seasons with stored history, oldest first. */
  async seasons(leagueId: string): Promise<number[]> {
    const keys = this.db
      ? await this.db.keys('seasons', leagueRange(leagueId))
      : [...this.memory.keys()]
          .filter(k => k.startsWith(`seasons|${JSON.stringify([leagueId]).slice(0, -1)},`))
          .map(k => JSON.parse(k.slice('seasons|'.length)) as IDBValidKey);
    return keys.map(k => (k as [string, number])[1]).sort((a, b) => a - b);
  }

  /**
   * A player's game-by-game log for one season (spec 9.3): the season's tables load in one read each, and
   * the player index finds his rows.
   */
  async gameLog(leagueId: string, playerId: string, season: number): Promise<GameLogEntry[]> {
    const tables = await this.seasonTables(leagueId, season);
    const summary = await this.season(leagueId, season);
    return gameLog(playerId, tables, (id, table) => this.indexFor(id, table), summary);
  }

  /** Deletes every record of a league's history. */
  async removeLeague(leagueId: string): Promise<void> {
    if (this.cache?.leagueId === leagueId) this.cache = null;
    if (this.db) {
      await this.db.batch([
        ...HISTORY_STORES.filter(s => s !== 'records').map((store): BatchOp => ({
          type: 'delete',
          store,
          key: leagueRange(leagueId)
        })),
        { type: 'delete', store: 'records', key: leagueId }
      ]);
      return;
    }
    const prefix = JSON.stringify([leagueId]).slice(0, -1);
    for (const k of [...this.memory.keys()])
      if (k.includes(`|${prefix},`) || k === this.key('records', leagueId)) this.memory.delete(k);
  }

  /** The league's whole history for an export file (spec 21). */
  async exportHistory(leagueId: string): Promise<HistoryExport> {
    const all = async <T>(store: HistoryStoreName): Promise<T[]> =>
      this.db
        ? this.db.getAll<T>(store, leagueRange(leagueId))
        : [...this.memory]
            .filter(([k]) => k.startsWith(`${store}|${JSON.stringify([leagueId]).slice(0, -1)},`))
            .map(([, v]) => v as T);
    return {
      tables: (await all<StatTable>('statTables')).map(encodeTable),
      games: await all<GameRecord>('gameRecords'),
      players: await all<PlayerHistory>('playerHistory'),
      seasons: await all<SeasonSummary>('seasons'),
      records: (await this.get<RecordsBook>('records', leagueId)) ?? null
    };
  }

  /** Stores an imported league's history under its ID, replacing any history it had. */
  async importHistory(leagueId: string, history: HistoryExport): Promise<void> {
    await this.removeLeague(leagueId);
    const ops: { store: HistoryStoreName; key: IDBValidKey; value: unknown }[] = [
      ...history.tables.map(e => {
        const t = decodeTable(e);
        return { store: 'statTables' as const, key: [leagueId, t.season, t.table], value: t };
      }),
      ...history.games.map(g => ({ store: 'gameRecords' as const, key: [leagueId, g.id], value: g })),
      ...history.players.map(p => ({ store: 'playerHistory' as const, key: [leagueId, p.id], value: p })),
      ...history.seasons.map(s => ({ store: 'seasons' as const, key: [leagueId, s.season], value: s }))
    ];
    if (history.records) ops.push({ store: 'records', key: leagueId, value: history.records });
    await this.write(ops);
  }
}
