/**
 * Overall ratings (spec 7.1): per position, a linear formula over the relevant ratings, clamped to 0-99.
 * Overall is a display and generic-value number; the sim uses role ratings (spec 7.3).
 *
 * These are the hand-set formulas for the no-CSV path (build order). They're weighted averages
 * (coefficients sum to 1, no intercept). When the Madden CSV arrives, `fitFormula` refits each
 * position by least squares against Madden's OVR column and the fitted formulas replace these.
 */
import type { Position } from '../model/positions';
import { clampRating, type RatingKey, type Ratings } from '../model/ratings';

export interface OverallFormula {
  intercept: number;
  coefficients: Partial<Record<RatingKey, number>>;
}

type Weights = Partial<Record<RatingKey, number>>;

const normalize = (weights: Weights): OverallFormula => {
  const total = Object.values(weights).reduce((a, b) => a + (b ?? 0), 0);
  return {
    intercept: 0,
    coefficients: Object.fromEntries(Object.entries(weights).map(([k, w]) => [k, (w ?? 0) / total]))
  };
};

// Relative weights per position (provisional, hand-set).
const TACKLE: Weights = {
  pbk: 20,
  pbf: 12,
  pbp: 12,
  rbk: 14,
  rbp: 8,
  rbf: 8,
  str: 10,
  awr: 10,
  agi: 3,
  acc: 3
};
const GUARD: Weights = {
  rbk: 18,
  rbp: 12,
  rbf: 8,
  pbk: 16,
  pbp: 10,
  pbf: 7,
  str: 13,
  awr: 10,
  ibl: 4,
  acc: 2
};
const END: Weights = { fmv: 14, pmv: 14, bsh: 12, pur: 10, spd: 8, acc: 8, str: 10, tak: 10, prc: 8, awr: 6 };
const OLB: Weights = {
  pur: 12,
  tak: 12,
  spd: 10,
  acc: 6,
  bsh: 8,
  fmv: 8,
  pmv: 6,
  zcv: 8,
  mcv: 4,
  prc: 10,
  awr: 10,
  pow: 4,
  str: 2
};
const KICKER: Weights = { kpw: 45, kac: 45, awr: 10 };

export const HAND_SET_FORMULAS: Record<Position, OverallFormula> = {
  QB: normalize({ thp: 18, sac: 14, mac: 14, dac: 10, awr: 20, tup: 7, tor: 5, pac: 4, spd: 3, bsk: 3 }),
  HB: normalize({ spd: 14, acc: 10, agi: 9, bcv: 13, car: 8, btk: 8, awr: 8, jkm: 5, cod: 6, cth: 5, trk: 5, sfa: 3, spm: 3, str: 3 }),
  FB: normalize({ rbk: 16, ibl: 10, lbk: 18, str: 12, awr: 12, car: 7, cth: 8, trk: 7, spd: 5, pbk: 5 }),
  WR: normalize({ cth: 13, spd: 14, srr: 10, mrr: 10, drr: 10, rls: 8, cit: 8, spc: 6, awr: 7, acc: 5, agi: 4, cod: 3, jmp: 2 }),
  TE: normalize({ cth: 14, rbk: 12, pbk: 6, srr: 9, mrr: 8, cit: 8, spd: 8, str: 8, awr: 10, rls: 5, drr: 3, ibl: 5, rbp: 2, acc: 2 }),
  LT: normalize(TACKLE),
  RT: normalize(TACKLE),
  LG: normalize(GUARD),
  RG: normalize(GUARD),
  C: normalize({ rbk: 17, rbp: 11, rbf: 8, pbk: 16, pbp: 10, pbf: 7, str: 12, awr: 14, ibl: 3, acc: 2 }),
  LE: normalize(END),
  RE: normalize(END),
  DT: normalize({ bsh: 18, pmv: 14, fmv: 8, str: 18, tak: 12, pur: 8, prc: 8, awr: 8, acc: 4, spd: 2 }),
  LOLB: normalize(OLB),
  ROLB: normalize(OLB),
  MLB: normalize({ tak: 16, pur: 12, prc: 14, awr: 14, bsh: 10, zcv: 10, spd: 8, pow: 6, acc: 4, mcv: 3, str: 3 }),
  CB: normalize({ mcv: 17, zcv: 14, spd: 16, acc: 7, agi: 6, cod: 6, prs: 8, prc: 8, awr: 8, cth: 4, jmp: 3, tak: 3 }),
  FS: normalize({ zcv: 18, spd: 14, mcv: 10, prc: 12, awr: 12, tak: 8, pur: 8, acc: 5, cth: 5, pow: 3, agi: 3, jmp: 2 }),
  SS: normalize({ zcv: 14, tak: 14, pur: 10, pow: 8, spd: 12, mcv: 8, prc: 12, awr: 12, acc: 4, str: 3, bsh: 3 }),
  K: normalize(KICKER),
  P: normalize(KICKER),
  LS: normalize({ lsp: 70, awr: 15, str: 5, rbk: 5, pbk: 5 })
}; // prettier-ignore

/** Unrounded formula value. */
export function formulaValue(formula: OverallFormula, ratings: Ratings): number {
  let total = formula.intercept;
  for (const [key, coefficient] of Object.entries(formula.coefficients)) {
    total += (coefficient ?? 0) * ratings[key as RatingKey];
  }
  return total;
}

export function overall(
  position: Position,
  ratings: Ratings,
  formulas: Record<Position, OverallFormula> = HAND_SET_FORMULAS
): number {
  return clampRating(formulaValue(formulas[position], ratings));
}

export interface FitSample {
  ratings: Ratings;
  ovr: number;
}

export interface FitResult {
  formula: OverallFormula;
  /** Mean absolute error and the share of samples within 2 points, on the samples. */
  meanAbsError: number;
  within2: number;
}

/**
 * Least-squares fit of OVR against the given ratings (spec 7.1), with a small ridge term for stability
 * when ratings are collinear. Needs more samples than predictors.
 */
export function fitFormula(
  samples: readonly FitSample[],
  keys: readonly RatingKey[],
  ridge = 1e-6
): FitResult {
  const p = keys.length + 1;
  if (samples.length <= p) throw new Error(`Need more than ${p} samples to fit ${keys.length} ratings`);
  const xtx = Array.from({ length: p }, () => new Array<number>(p).fill(0));
  const xty = new Array<number>(p).fill(0);
  const row = new Array<number>(p);
  for (const sample of samples) {
    row[0] = 1;
    keys.forEach((k, i) => (row[i + 1] = sample.ratings[k]));
    for (let i = 0; i < p; i++) {
      xty[i] = (xty[i] as number) + (row[i] as number) * sample.ovr;
      const xi = xtx[i] as number[];
      for (let j = 0; j < p; j++) xi[j] = (xi[j] as number) + (row[i] as number) * (row[j] as number);
    }
  }
  for (let i = 1; i < p; i++)
    (xtx[i] as number[])[i] = ((xtx[i] as number[])[i] as number) + ridge * samples.length;
  const beta = solve(xtx, xty);
  const formula: OverallFormula = {
    intercept: beta[0] as number,
    coefficients: Object.fromEntries(keys.map((k, i) => [k, beta[i + 1] as number]))
  };
  let abs = 0;
  let close = 0;
  for (const sample of samples) {
    const error = Math.abs(clampRating(formulaValue(formula, sample.ratings)) - sample.ovr);
    abs += error;
    if (error <= 2) close++;
  }
  return { formula, meanAbsError: abs / samples.length, within2: close / samples.length };
}

/** Solves A x = b by Gaussian elimination with partial pivoting. */
function solve(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((r, i) => [...r, b[i] as number]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs((m[r] as number[])[col] as number) > Math.abs((m[pivot] as number[])[col] as number))
        pivot = r;
    }
    [m[col], m[pivot]] = [m[pivot] as number[], m[col] as number[]];
    const top = m[col] as number[];
    const lead = top[col] as number;
    if (Math.abs(lead) < 1e-12) throw new Error('Ratings are collinear; add samples or drop a rating');
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const cur = m[r] as number[];
      const factor = (cur[col] as number) / lead;
      if (factor === 0) continue;
      for (let c = col; c <= n; c++) cur[c] = (cur[c] as number) - factor * (top[c] as number);
    }
  }
  return m.map((r, i) => (r[n] as number) / ((r[i] as number) || 1));
}
