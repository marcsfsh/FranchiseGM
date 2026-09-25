/**
 * Sorting table rows by up to four columns (post-M23 section 1.2, style guide 7.3). Pure: no DOM, so the
 * order is unit tested. Ties fall back to the table's own order (the order its rows arrive in) and then a
 * stable row ID, so rows never shuffle between renders; unknown values sort after known ones in either
 * direction.
 */

export type SortDir = 'asc' | 'desc';

/** How a column's values compare, and how its directions read ("high to low", "A to Z"). */
export type SortType = 'number' | 'text' | 'date' | 'money' | 'rating' | 'custom';

export interface SortLevel {
  column: string;
  dir: SortDir;
}

/** The most columns a table sorts by at once. */
export const MAX_LEVELS = 4;

export interface SortKey<Row> {
  id: string;
  /** The column's name in sentences, like "passing yards". */
  name: string;
  type: SortType;
  /** The value sorted on. Null, undefined, and NaN are unknown and sort last either way. */
  value?: (row: Row) => number | string | null | undefined;
  /** An ascending comparison, for custom columns. */
  compare?: (a: Row, b: Row) => number;
  /** The first direction a column sorts in: numbers high to low and text A to Z unless set. */
  first?: SortDir;
  /** What each direction reads as, for custom columns: [ascending, descending]. */
  words?: readonly [string, string];
}

export const flip = (dir: SortDir): SortDir => (dir === 'asc' ? 'desc' : 'asc');

export const firstDir = <Row>(key: SortKey<Row>): SortDir =>
  key.first ?? (key.type === 'text' ? 'asc' : 'desc');

/** A direction in words: "high to low", "A to Z", "newest first". */
export function dirWords<Row>(key: SortKey<Row>, dir: SortDir): string {
  const [asc, desc] =
    key.words ??
    (key.type === 'text' ? ['A to Z', 'Z to A'] : key.type === 'date' ? ['oldest first', 'newest first'] : ['low to high', 'high to low']);
  return dir === 'asc' ? asc : desc;
} // prettier-ignore

const unknown = (v: unknown): boolean =>
  v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v));

const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

function compareBy<Row>(key: SortKey<Row>, a: Row, b: Row, dir: SortDir): number {
  const sign = dir === 'asc' ? 1 : -1;
  if (key.compare) return sign * key.compare(a, b);
  const va = key.value?.(a);
  const vb = key.value?.(b);
  const ua = unknown(va);
  const ub = unknown(vb);
  if (ua || ub) return ua === ub ? 0 : ua ? 1 : -1;
  if (typeof va === 'number' && typeof vb === 'number') return sign * (va - vb);
  return sign * collator.compare(String(va), String(vb));
}

/** The rows in sorted order: by each level in turn, then the rows' own order, then their IDs. */
export function sortRows<Row>(
  rows: readonly Row[],
  keys: readonly SortKey<Row>[],
  levels: readonly SortLevel[],
  idOf: (row: Row) => string
): Row[] {
  const byId = new Map(keys.map(k => [k.id, k]));
  const active = levels.flatMap(l => {
    const key = byId.get(l.column);
    return key ? [{ key, dir: l.dir }] : [];
  });
  return rows
    .map((row, index) => ({ row, index, id: idOf(row) }))
    .sort((a, b) => {
      for (const { key, dir } of active) {
        const c = compareBy(key, a.row, b.row, dir);
        if (c !== 0) return c;
      }
      return a.index - b.index || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    })
    .map(x => x.row);
}

/**
 * A header pressed: its column becomes the only sort column in its first direction, or, if it already
 * led the sort, the only one in the other direction.
 */
export function pressHeader<Row>(levels: readonly SortLevel[], key: SortKey<Row>): SortLevel[] {
  const lead = levels[0];
  return [{ column: key.id, dir: lead?.column === key.id ? flip(lead.dir) : firstDir(key) }];
}

/**
 * A header pressed with Shift: its column joins as the next level, or reverses if it's already one.
 * Returns null when every level is taken.
 */
export function addLevel<Row>(levels: readonly SortLevel[], key: SortKey<Row>): SortLevel[] | null {
  const at = levels.findIndex(l => l.column === key.id);
  if (at >= 0) return levels.map((l, i) => (i === at ? { ...l, dir: flip(l.dir) } : l));
  if (levels.length >= MAX_LEVELS) return null;
  return [...levels, { column: key.id, dir: firstDir(key) }];
}

/** A level moved up (-1) or down (+1) in the order. */
export function moveLevel(levels: readonly SortLevel[], index: number, by: -1 | 1): SortLevel[] {
  const to = index + by;
  if (to < 0 || to >= levels.length) return [...levels];
  const next = [...levels];
  [next[index], next[to]] = [next[to] as SortLevel, next[index] as SortLevel];
  return next;
}

/** "Sorted by touchdowns, high to low, then passing yards, high to low." */
export function describeSort<Row>(
  levels: readonly SortLevel[],
  keys: readonly SortKey<Row>[],
  defaultOrder: string
): string {
  const byId = new Map(keys.map(k => [k.id, k]));
  const parts = levels.flatMap(l => {
    const key = byId.get(l.column);
    return key ? [`${key.name}, ${dirWords(key, l.dir)}`] : [];
  });
  return parts.length ? `Sorted by ${parts.join(', then ')}.` : `Sorted ${defaultOrder}.`;
}

/** A column title as it reads mid-sentence: "Passing yards" becomes "passing yards"; "QB rating" stays. */
export const spoken = (title: string): string =>
  /^[A-Z][a-z]/.test(title) ? title.charAt(0).toLowerCase() + title.slice(1) : title;
