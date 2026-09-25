import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/engine/rng';
import { POSITIONS } from '../../src/engine/model/positions';
import { RATING_KEYS, emptyRatings, type RatingKey, type Ratings } from '../../src/engine/model/ratings';
import { HAND_SET_FORMULAS, fitFormula, formulaValue, overall } from '../../src/engine/ratings/overall';

const randomRatings = (rng: Rng): Ratings => {
  const r = emptyRatings();
  for (const k of RATING_KEYS) r[k] = rng.int(20, 99);
  return r;
};

describe('overall formulas (spec 7.1)', () => {
  it('has a formula for every position with positive weights and a Madden-style stretch', () => {
    for (const position of POSITIONS) {
      const f = HAND_SET_FORMULAS[position];
      const values = Object.values(f.coefficients) as number[];
      expect(
        values.every(v => v > 0),
        position
      ).toBe(true);
      const scale = values.reduce((a, b) => a + b, 0);
      expect(scale, position).toBeGreaterThanOrEqual(1);
      expect(scale, position).toBeLessThan(1.7);
      expect(f.intercept, position).toBeLessThanOrEqual(0);
    }
  });

  it('stays in 0 to 99 and rises with every weighted rating', () => {
    for (const position of POSITIONS) {
      expect(overall(position, emptyRatings(99))).toBeGreaterThanOrEqual(95);
      expect(overall(position, emptyRatings(0))).toBe(0);
      expect(overall(position, emptyRatings(80))).toBeGreaterThan(overall(position, emptyRatings(70)));
    }
  });

  it('weights position skills: a strong arm raises a QB, not a CB', () => {
    const base = emptyRatings(60);
    const arm = { ...base, thp: 99, sac: 95, mac: 95, dac: 95 };
    expect(overall('QB', arm)).toBeGreaterThan(overall('QB', base) + 10);
    expect(overall('CB', arm)).toBe(overall('CB', base));
  });
});

describe('least-squares fitter', () => {
  it('recovers known weights from noisy samples', () => {
    const rng = new Rng(42);
    const keys: RatingKey[] = ['spd', 'mcv', 'zcv', 'awr'];
    const truth = { intercept: -12, coefficients: { spd: 0.35, mcv: 0.3, zcv: 0.25, awr: 0.25 } };
    const samples = Array.from({ length: 800 }, () => {
      const ratings = randomRatings(rng);
      return {
        ratings,
        ovr: Math.max(0, Math.min(99, Math.round(formulaValue(truth, ratings) + rng.normal(0, 0.8))))
      };
    });
    const fit = fitFormula(samples, keys);
    expect(fit.formula.intercept).toBeCloseTo(-12, 0);
    for (const k of keys) expect(fit.formula.coefficients[k]).toBeCloseTo(truth.coefficients[k as 'spd'], 1);
    expect(fit.meanAbsError).toBeLessThan(1.2);
    expect(fit.within2).toBeGreaterThan(0.9);
  });

  it('needs more samples than predictors', () => {
    expect(() => fitFormula([{ ratings: emptyRatings(50), ovr: 50 }], ['spd'])).toThrow(/samples/);
  });
});
