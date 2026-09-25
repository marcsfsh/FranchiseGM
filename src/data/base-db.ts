/**
 * The embedded base database (spec 3.3, 6.8): a columnar JSON block built by tools/build-db.ts and
 * decoded at startup. Columnar tables (one array per field) keep it compact.
 */
import type { ImportedPlayer } from './madden-import';
import type { ClimateTable, MonthClimate } from './climate';
import type { Colleges, FirstNames, Hometowns, WeightedList } from './names';
import type { ScheduledGame } from './schedule';
import type { StaffMember } from '../engine/model/staff';
import { RATING_KEYS, type Ratings } from '../engine/model/ratings';

export const BASE_DB_VERSION = 1;

export interface BaseDb {
  version: number;
  season: number;
  /** 'madden' when built from the Madden CSV; 'fictional' on the no-CSV path. */
  source: 'fictional' | 'madden';
  schedule: ScheduledGame[];
  climate: ClimateTable;
  names: { first: FirstNames; surnames: WeightedList; hometowns: Hometowns; colleges: Colleges };
  /** Default coaches and staff for real-data leagues (fictional leagues generate their own). */
  staff: StaffMember[];
  /** Imported Madden players; empty on the no-CSV path. */
  players: ImportedPlayer[];
}

export type Columns = Record<string, unknown[]>;

export interface BaseDbJson {
  version: number;
  season: number;
  source: BaseDb['source'];
  schedule: Columns;
  climate: { keys: string[]; values: number[][] };
  names: BaseDb['names'];
  staff: Columns;
  players: Columns;
}

/** Rows to columns. Every row must have the same keys as the first. */
export function toColumns(rows: readonly object[]): Columns {
  const first = rows[0];
  if (!first) return {};
  const columns: Columns = {};
  for (const key of Object.keys(first)) columns[key] = rows.map(row => (row as Record<string, unknown>)[key]);
  return columns;
}

export function fromColumns<T>(columns: Columns): T[] {
  const keys = Object.keys(columns);
  const length = keys.length ? (columns[keys[0] as string] as unknown[]).length : 0;
  return Array.from(
    { length },
    (_, i) => Object.fromEntries(keys.map(k => [k, (columns[k] as unknown[])[i]])) as T
  );
}

const CLIMATE_FIELDS: (keyof MonthClimate)[] = ['highF', 'lowF', 'precipIn', 'snowIn', 'windMph'];

export function encodeBaseDb(db: BaseDb): BaseDbJson {
  const keys = Object.keys(db.climate).sort();
  return {
    version: db.version,
    season: db.season,
    source: db.source,
    schedule: toColumns(db.schedule),
    climate: {
      keys,
      values: keys.map(k => (db.climate[k] as MonthClimate[]).flatMap(m => CLIMATE_FIELDS.map(f => m[f])))
    },
    names: db.names,
    staff: toColumns(db.staff),
    players: toColumns(
      db.players.map(({ ratings, ...rest }) => ({
        ...rest,
        ...Object.fromEntries(RATING_KEYS.map(k => [`r_${k}`, ratings[k]]))
      }))
    )
  };
}

export function decodeBaseDb(json: BaseDbJson): BaseDb {
  if (json.version !== BASE_DB_VERSION)
    throw new Error(`Base database version ${json.version} isn't supported`);
  const climate: ClimateTable = {};
  json.climate.keys.forEach((key, i) => {
    const values = json.climate.values[i] as number[];
    climate[key] = Array.from(
      { length: 12 },
      (_, m) =>
        Object.fromEntries(
          CLIMATE_FIELDS.map((f, j) => [f, values[m * CLIMATE_FIELDS.length + j]])
        ) as unknown as MonthClimate
    );
  });
  const players = fromColumns<Record<string, unknown>>(json.players).map(row => {
    const ratings = {} as Ratings;
    const rest: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      if (k.startsWith('r_')) ratings[k.slice(2) as keyof Ratings] = v as number;
      else rest[k] = v;
    }
    return { ...rest, ratings } as unknown as ImportedPlayer;
  });
  return {
    version: json.version,
    season: json.season,
    source: json.source,
    schedule: fromColumns<ScheduledGame>(json.schedule),
    climate,
    names: json.names,
    staff: fromColumns<StaffMember>(json.staff),
    players
  };
}
