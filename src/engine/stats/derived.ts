/**
 * Derived stats (spec 9.2): computed from stored totals, never stored. Each returns null when the
 * denominator is zero, so screens can show a dash instead of a misleading zero.
 */
import type { StatKey } from '../sim/stats';

type Source = Readonly<Partial<Record<StatKey, number>>>;

const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);
const get = (s: Source, key: StatKey): number => s[key] ?? 0;

/**
 * The NFL passer rating: four components (completion rate, yards, touchdowns, and interceptions per
 * attempt), each held between 0 and 2.375, averaged and scaled to a maximum of 158.3.
 */
const RATING = {
  cmpBase: 0.3,
  cmpScale: 5,
  ydsBase: 3,
  ydsScale: 0.25,
  tdScale: 20,
  cap: 2.375,
  intScale: 25
};

export function passerRating(s: Source): number | null {
  const att = get(s, 'passAtt');
  if (att <= 0) return null;
  const clampPart = (x: number) => Math.max(0, Math.min(RATING.cap, x));
  const a = clampPart((get(s, 'passCmp') / att - RATING.cmpBase) * RATING.cmpScale);
  const b = clampPart((get(s, 'passYds') / att - RATING.ydsBase) * RATING.ydsScale);
  const c = clampPart((get(s, 'passTd') / att) * RATING.tdScale);
  const d = clampPart(RATING.cap - (get(s, 'passInt') / att) * RATING.intScale);
  return ((a + b + c + d) / 6) * 100;
}

/** Adjusted yards per attempt: a touchdown is worth 20 yards and an interception costs 45. */
const AYA = { td: 20, int: 45 };

export const DERIVED = {
  completionPct: (s: Source) => pct(get(s, 'passCmp'), get(s, 'passAtt')),
  yardsPerAttempt: (s: Source) => ratio(get(s, 'passYds'), get(s, 'passAtt')),
  adjustedYardsPerAttempt: (s: Source) =>
    ratio(get(s, 'passYds') + AYA.td * get(s, 'passTd') - AYA.int * get(s, 'passInt'), get(s, 'passAtt')),
  passerRating,
  yardsPerCarry: (s: Source) => ratio(get(s, 'rushYds'), get(s, 'rushAtt')),
  catchRate: (s: Source) => pct(get(s, 'receptions'), get(s, 'targets')),
  yardsPerCatch: (s: Source) => ratio(get(s, 'recYds'), get(s, 'receptions')),
  tackles: (s: Source) => get(s, 'soloTackles') + get(s, 'assistedTackles'),
  runBlockWinRate: (s: Source) => pct(get(s, 'runBlockWins'), get(s, 'runBlockSnaps')),
  fieldGoalPct: (s: Source) => pct(get(s, 'fgMade'), get(s, 'fgAtt')),
  extraPointPct: (s: Source) => pct(get(s, 'xpMade'), get(s, 'xpAtt')),
  puntAverage: (s: Source) => ratio(get(s, 'puntYds'), get(s, 'punts')),
  netPuntAverage: (s: Source) => ratio(get(s, 'puntNetYds'), get(s, 'punts')),
  kickReturnAverage: (s: Source) => ratio(get(s, 'kickReturnYds'), get(s, 'kickReturns')),
  puntReturnAverage: (s: Source) => ratio(get(s, 'puntReturnYds'), get(s, 'puntReturns'))
} as const;

export type DerivedId = keyof typeof DERIVED;

function pct(a: number, b: number): number | null {
  const r = ratio(a, b);
  return r === null ? null : r * 100;
}
