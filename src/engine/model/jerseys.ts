/** Jersey number ranges by position (NFL numbering rules from 2021, with 0 allowed from 2023). */
import type { Position } from './positions';

type Range = readonly [number, number];

const R = {
  qb: [[0, 19]],
  skill: [[0, 49], [80, 89]],
  ol: [[50, 79]],
  dl: [[50, 79], [90, 99], [0, 49]],
  lb: [[0, 59], [90, 99]],
  db: [[0, 49]],
  kick: [[0, 49], [90, 99]],
  ls: [[40, 69], [90, 99]]
} as const satisfies Record<string, readonly Range[]>; // prettier-ignore

export const JERSEY_RANGES: Record<Position, readonly Range[]> = {
  QB: R.qb, HB: R.skill, FB: R.skill, WR: R.skill, TE: R.skill,
  LT: R.ol, LG: R.ol, C: R.ol, RG: R.ol, RT: R.ol,
  LE: R.dl, RE: R.dl, DT: R.dl, LOLB: R.lb, MLB: R.lb, ROLB: R.lb,
  CB: R.db, FS: R.db, SS: R.db, K: R.kick, P: R.kick, LS: R.ls
}; // prettier-ignore

export function jerseyAllowed(position: Position, jersey: number): boolean {
  return JERSEY_RANGES[position].some(([lo, hi]) => jersey >= lo && jersey <= hi);
}

/** The lowest allowed number not in `taken`, or null if every allowed number is taken. */
export function freeJersey(position: Position, taken: ReadonlySet<number>): number | null {
  for (const [lo, hi] of JERSEY_RANGES[position]) {
    for (let n = lo; n <= hi; n++) if (!taken.has(n)) return n;
  }
  return null;
}
