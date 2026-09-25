/**
 * League saves (spec 21): one slot per league in IndexedDB, a summary list for the start screen,
 * gzipped JSON export and import, and save versioning without migration (spec 2.4).
 */
import { SAVE_SCHEMA_VERSION, summarize, type League, type LeagueSummary } from '../engine/league/types';
import { Db, StorageUnavailableError, requestPersistence, type DbSpec } from './idb';

export const SAVES_DB: DbSpec = {
  name: 'franchise-gm',
  version: 2,
  // 'app' holds small records such as the last opened league, written in awaited transactions so a
  // reload right after a change still sees it.
  stores: [{ name: 'leagues', keyPath: 'id' }, { name: 'states' }, { name: 'app' }]
};

const LAST_LEAGUE = 'lastLeague';

export const EXPORT_FORMAT = 'franchise-gm-league';

/** A save written by a different version of the game. It is never migrated (spec 2.4). */
export class SaveVersionError extends Error {
  constructor(readonly found: unknown) {
    super(
      typeof found === 'number' && found < SAVE_SCHEMA_VERSION
        ? `This league was saved by an older version of Franchise GM (save format ${found}). This version uses format ${SAVE_SCHEMA_VERSION} and doesn't convert old saves. Open it in the version that created it, or start a new league.`
        : `This league was saved by a newer or unknown version of Franchise GM (save format ${String(found)}). Update the game file to open it.`
    );
    this.name = 'SaveVersionError';
  }
}

export class ImportFormatError extends Error {
  constructor(message = "This file isn't a Franchise GM league export.") {
    super(message);
    this.name = 'ImportFormatError';
  }
}

/** Checks a stored or imported value before the game uses it as a league. */
export function checkLeague(value: unknown): League {
  if (!value || typeof value !== 'object') throw new ImportFormatError();
  const schema = (value as { schema?: unknown }).schema;
  if (schema !== SAVE_SCHEMA_VERSION) throw new SaveVersionError(schema);
  const league = value as League;
  if (!league.meta?.id || !league.players || !league.teams)
    throw new ImportFormatError('This league file is incomplete.');
  return league;
}

export class SaveStore {
  private persistenceAsked = false;
  private readonly memoryLeagues = new Map<string, LeagueSummary>();
  private readonly memoryStates = new Map<string, League>();
  private memoryLast: string | null = null;

  private constructor(
    private readonly db: Db | null,
    /** Why saving is unavailable, or null when IndexedDB works. */
    readonly unavailableReason: string | null
  ) {}

  /** Opens the save database. When the browser blocks IndexedDB, saves live in memory for the session. */
  static async open(factory?: IDBFactory | null): Promise<SaveStore> {
    try {
      return new SaveStore(
        await Db.open(SAVES_DB, factory === undefined ? (globalThis.indexedDB ?? null) : factory),
        null
      );
    } catch (error) {
      const reason =
        error instanceof StorageUnavailableError ? error.message : 'The save database could not be opened.';
      return new SaveStore(null, reason);
    }
  }

  get available(): boolean {
    return this.db !== null;
  }

  async list(): Promise<LeagueSummary[]> {
    const all = this.db ? await this.db.getAll<LeagueSummary>('leagues') : [...this.memoryLeagues.values()];
    return all.sort((a, b) => b.savedAt - a.savedAt || a.name.localeCompare(b.name));
  }

  /** Saves the whole league. The summary and state are written in one transaction. */
  async save(league: League, now = Date.now()): Promise<LeagueSummary> {
    const summary = summarize(league, now);
    if (!this.db) {
      this.memoryLeagues.set(summary.id, summary);
      this.memoryStates.set(summary.id, structuredClone(league));
      return summary;
    }
    await this.db.batch([
      { type: 'put', store: 'leagues', value: summary },
      { type: 'put', store: 'states', value: league, key: summary.id }
    ]);
    if (!this.persistenceAsked) {
      this.persistenceAsked = true;
      void requestPersistence();
    }
    return summary;
  }

  async load(id: string): Promise<League> {
    const state = this.db ? await this.db.get<League>('states', id) : this.memoryStates.get(id);
    if (!state) throw new Error('That league is no longer saved in this browser.');
    return checkLeague(this.db ? state : structuredClone(state));
  }

  /** The league that was open when the game was last used, or null. */
  async getLastLeague(): Promise<string | null> {
    if (!this.db) return this.memoryLast;
    return (await this.db.get<string | null>('app', LAST_LEAGUE)) ?? null;
  }

  async setLastLeague(id: string | null): Promise<void> {
    if (!this.db) {
      this.memoryLast = id;
      return;
    }
    await this.db.put('app', id, LAST_LEAGUE);
  }

  async remove(id: string): Promise<void> {
    if (!this.db) {
      this.memoryLeagues.delete(id);
      this.memoryStates.delete(id);
      return;
    }
    const last = await this.getLastLeague();
    await this.db.batch([
      { type: 'delete', store: 'leagues', key: id },
      { type: 'delete', store: 'states', key: id },
      ...(last === id ? [{ type: 'put' as const, store: 'app', value: null, key: LAST_LEAGUE }] : [])
    ]);
  }
}

/** A league as a gzipped JSON file (spec 21). */
export async function exportLeague(league: League): Promise<Blob> {
  const text = JSON.stringify({ format: EXPORT_FORMAT, schema: league.schema, league });
  const gz = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Blob([await new Response(gz).arrayBuffer()], { type: 'application/gzip' });
}

/** Reads an exported league, gzipped or plain JSON. */
export async function importLeague(file: Blob): Promise<League> {
  const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  let text: string;
  try {
    text =
      head[0] === 0x1f && head[1] === 0x8b
        ? await new Response(file.stream().pipeThrough(new DecompressionStream('gzip'))).text()
        : await file.text();
  } catch {
    throw new ImportFormatError('This file is damaged and could not be unpacked.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ImportFormatError();
  }
  const envelope = parsed as { format?: unknown; schema?: unknown; league?: unknown };
  if (envelope.format !== EXPORT_FORMAT) throw new ImportFormatError();
  if (envelope.schema !== SAVE_SCHEMA_VERSION) throw new SaveVersionError(envelope.schema);
  return checkLeague(envelope.league);
}

/** A file name like franchise-gm-my-league-2026-week-1.json.gz. */
export function exportFileName(league: League): string {
  const slug =
    league.meta.name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'league';
  const when = league.date.phase === 'regularSeason' ? `week-${league.date.week}` : league.date.phase;
  return `franchise-gm-${slug}-${league.date.season}-${when}.json.gz`;
}
