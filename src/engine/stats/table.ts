/**
 * Columnar stat tables (spec 9.3): one per season per category, with a typed-array column for each field.
 * Rows name their player and game through dictionaries kept with the table, so a season of game lines
 * packs into a few hundred kilobytes and loads in one read.
 */
import { TEAM_ABBRS, type TeamAbbr } from '../../data/team-colors';

/** Preseason lines are stored but left out of totals (spec 9.3); playoff lines total apart. */
export type GameKind = 'preseason' | 'regular' | 'playoffs';

/** One player's line in one game for one table. */
export interface StatRow {
  playerId: string;
  gameId: string;
  team: TeamAbbr;
  kind: GameKind;
  /** Field values; fields left out are zero. */
  values: Readonly<Record<string, number>>;
}

export interface StatTable {
  season: number;
  /** The category table's ID. */
  table: string;
  fields: readonly string[];
  /** Player and game IDs; rows refer to them by position. */
  players: string[];
  games: string[];
  rows: number;
  player: Uint16Array;
  game: Uint16Array;
  /** Position in TEAM_ABBRS. */
  team: Uint8Array;
  /** The game kind: 0 regular season, 1 preseason, 2 playoffs. */
  kind: Uint8Array;
  columns: Record<string, Int16Array>;
}

const KINDS: readonly GameKind[] = ['regular', 'preseason', 'playoffs'];
const MIN = -32768;
const MAX = 32767;

export function emptyTable(season: number, table: string, fields: readonly string[]): StatTable {
  return {
    season,
    table,
    fields,
    players: [],
    games: [],
    rows: 0,
    player: new Uint16Array(0),
    game: new Uint16Array(0),
    team: new Uint8Array(0),
    kind: new Uint8Array(0),
    columns: Object.fromEntries(fields.map(f => [f, new Int16Array(0)]))
  };
}

function grow<A extends Uint8Array | Uint16Array | Int16Array>(array: A, length: number): A {
  const next = new (array.constructor as new (n: number) => A)(length);
  next.set(array);
  return next;
}

/** A new table with the rows added at the end. The original is left unchanged. */
export function appendRows(table: StatTable, rows: readonly StatRow[]): StatTable {
  if (!rows.length) return table;
  const players = [...table.players];
  const games = [...table.games];
  const playerIndex = new Map(players.map((id, i) => [id, i]));
  const gameIndex = new Map(games.map((id, i) => [id, i]));
  const at = (map: Map<string, number>, list: string[], id: string): number => {
    let i = map.get(id);
    if (i === undefined) {
      i = list.length;
      if (i > 0xffff) throw new Error('A stat table holds at most 65,536 players and games.');
      list.push(id);
      map.set(id, i);
    }
    return i;
  };
  const length = table.rows + rows.length;
  const next: StatTable = {
    ...table,
    players,
    games,
    rows: length,
    player: grow(table.player, length),
    game: grow(table.game, length),
    team: grow(table.team, length),
    kind: grow(table.kind, length),
    columns: Object.fromEntries(table.fields.map(f => [f, grow(table.columns[f] as Int16Array, length)]))
  };
  rows.forEach((row, k) => {
    const i = table.rows + k;
    next.player[i] = at(playerIndex, players, row.playerId);
    next.game[i] = at(gameIndex, games, row.gameId);
    next.team[i] = Math.max(0, TEAM_ABBRS.indexOf(row.team));
    next.kind[i] = KINDS.indexOf(row.kind);
    for (const f of table.fields) {
      const v = Math.round(row.values[f] ?? 0);
      (next.columns[f] as Int16Array)[i] = Math.max(MIN, Math.min(MAX, v));
    }
  });
  return next;
}

/** Row positions for each player, built when a season's table loads (spec 9.3 indexes). */
export function indexByPlayer(table: StatTable): Map<string, number[]> {
  const index = new Map<string, number[]>();
  for (let i = 0; i < table.rows; i++) {
    const id = table.players[table.player[i] as number] as string;
    const list = index.get(id);
    if (list) list.push(i);
    else index.set(id, [i]);
  }
  return index;
}

export function readRow(table: StatTable, i: number): StatRow {
  const values: Record<string, number> = {};
  for (const f of table.fields) values[f] = (table.columns[f] as Int16Array)[i] as number;
  return {
    playerId: table.players[table.player[i] as number] as string,
    gameId: table.games[table.game[i] as number] as string,
    team: TEAM_ABBRS[table.team[i] as number] as TeamAbbr,
    kind: kindAt(table, i),
    values
  };
}

export const kindAt = (table: StatTable, i: number): GameKind => KINDS[table.kind[i] as number] ?? 'regular';

/** Bytes the table's columns and dictionaries take, for storage reports. */
export function tableBytes(table: StatTable): number {
  const text = (list: readonly string[]) => list.reduce((sum, id) => sum + id.length + 1, 0);
  return (
    table.player.byteLength +
    table.game.byteLength +
    table.team.byteLength +
    table.kind.byteLength +
    Object.values(table.columns).reduce((sum, c) => sum + c.byteLength, 0) +
    text(table.players) +
    text(table.games)
  );
}

/** A table with its typed arrays as base64 text, for JSON export files (spec 21). */
export interface EncodedTable {
  season: number;
  table: string;
  fields: readonly string[];
  players: string[];
  games: string[];
  rows: number;
  player: string;
  game: string;
  team: string;
  kind: string;
  columns: Record<string, string>;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] as number;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out += B64[(n >> 18) & 63] + (B64[(n >> 12) & 63] as string);
    out += b === undefined ? '=' : B64[(n >> 6) & 63];
    out += c === undefined ? '=' : B64[n & 63];
  }
  return out;
}

function fromBase64(text: string): Uint8Array {
  const clean = text.replace(/=+$/, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let bits = 0;
  let value = 0;
  let o = 0;
  for (const ch of clean) {
    const v = B64.indexOf(ch);
    if (v < 0) throw new Error('A stat table in this file is damaged.');
    value = (value << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (value >> bits) & 0xff;
    }
  }
  return out;
}

// Typed arrays are written little-endian, the byte order of every browser the game supports.
const bytesOf = (a: Uint8Array | Uint16Array | Int16Array): Uint8Array =>
  new Uint8Array(a.buffer, a.byteOffset, a.byteLength);

export function encodeTable(t: StatTable): EncodedTable {
  return {
    season: t.season,
    table: t.table,
    fields: t.fields,
    players: t.players,
    games: t.games,
    rows: t.rows,
    player: toBase64(bytesOf(t.player)),
    game: toBase64(bytesOf(t.game)),
    team: toBase64(t.team),
    kind: toBase64(t.kind),
    columns: Object.fromEntries(t.fields.map(f => [f, toBase64(bytesOf(t.columns[f] as Int16Array))]))
  };
}

export function decodeTable(e: EncodedTable): StatTable {
  const u16 = (s: string) => new Uint16Array(fromBase64(s).slice().buffer);
  const i16 = (s: string) => new Int16Array(fromBase64(s).slice().buffer);
  const t: StatTable = {
    season: e.season,
    table: e.table,
    fields: e.fields,
    players: e.players,
    games: e.games,
    rows: e.rows,
    player: u16(e.player),
    game: u16(e.game),
    team: fromBase64(e.team),
    kind: fromBase64(e.kind),
    columns: Object.fromEntries(e.fields.map(f => [f, i16(e.columns[f] ?? '')]))
  };
  const lengths = [t.player, t.game, t.team, t.kind, ...Object.values(t.columns)].map(a => a.length);
  if (lengths.some(n => n !== e.rows)) throw new Error('A stat table in this file is damaged.');
  return t;
}
