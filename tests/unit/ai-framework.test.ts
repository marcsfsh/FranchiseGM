import { describe, expect, it } from 'vitest';
import { curves, decide, score, type Consideration } from '../../src/engine/ai/framework';
import { stream } from '../../src/engine/rng';

interface Option {
  name: string;
  a: number;
  b: number;
}

const byA: Consideration<Option> = { name: 'a', input: o => o.a, curve: curves.linear(0, 10) };
const byB: Consideration<Option> = { name: 'b', input: o => o.b, curve: curves.linear(0, 10) };
const options: Option[] = [
  { name: 'balanced', a: 6, b: 6 },
  { name: 'lopsided', a: 10, b: 0 },
  { name: 'weak', a: 3, b: 3 }
];

describe('the AI decision framework (spec 14.1)', () => {
  it('combines considerations by a weighted geometric mean, so one zero vetoes an option', () => {
    const scored = score(options, [byA, byB], { a: 1, b: 1 });
    const of = (name: string) => scored.find(s => s.option.name === name)?.score ?? NaN;
    expect(of('balanced')).toBeCloseTo(0.6, 10);
    expect(of('weak')).toBeCloseTo(0.3, 10);
    // A perfect score on one consideration can't rescue a zero on the other.
    expect(of('lopsided')).toBeLessThan(0.05);
    // Weights tilt the mean: weighting `a` three times makes 0.9^0.75 * 0.1^0.25.
    const tilted = score([{ name: 'x', a: 9, b: 1 }], [byA, byB], { a: 3, b: 1 })[0];
    expect(tilted?.score).toBeCloseTo(0.9 ** 0.75 * 0.1 ** 0.25, 10);
    expect(tilted?.parts.map(p => [p.name, p.input, p.weight])).toEqual([
      ['a', 9, 3],
      ['b', 1, 1]
    ]);
  });

  it('picks the best option nearly always when competent, and wanders among close ones when not', () => {
    const close: Option[] = [
      { name: 'best', a: 8, b: 8 },
      { name: 'close', a: 7.6, b: 7.6 },
      { name: 'far', a: 3, b: 3 }
    ];
    const picks = (competence: number) =>
      Array.from({ length: 400 }, (_, i) =>
        decide('test', 'tester', close, [byA, byB], {}, competence, stream(i, 'pick'), o => o.name)
      ).map(d => d?.chosen.name);
    const sharp = picks(100);
    const poor = picks(0);
    const share = (list: (string | undefined)[], name: string) =>
      list.filter(n => n === name).length / list.length;
    expect(share(sharp, 'best')).toBeGreaterThan(0.95);
    expect(share(poor, 'close')).toBeGreaterThan(0.2);
    expect(share(poor, 'far')).toBeLessThan(0.01);
  });

  it('logs the decision with its inputs, scores, and the options that lost', () => {
    const d = decide(
      'Sign a free agent',
      'MIN general manager',
      options,
      [byA, byB],
      {},
      100,
      stream(1, 'log'),
      o => o.name
    );
    expect(d?.log.decision).toBe('Sign a free agent');
    expect(d?.log.actor).toBe('MIN general manager');
    expect(d?.log.chosen.label).toBe('balanced');
    expect(d?.log.chosen.parts.map(p => p.input)).toEqual([6, 6]);
    expect(d?.log.rejected.map(r => r.label)).toEqual(['weak', 'lopsided']);
    expect(decide('none', 'nobody', [], [byA], {}, 50, stream(1), String)).toBeNull();
  });

  it('shapes inputs with response curves', () => {
    expect(curves.linear(10, 0)(2.5)).toBeCloseTo(0.75, 10);
    expect(curves.linear(0, 10)(-5)).toBe(0);
    expect(curves.logistic(0, 2)(0)).toBe(0.5);
    expect(curves.logistic(0, 2)(4)).toBeGreaterThan(0.85);
    expect(curves.flag(0.6)(0)).toBe(0.6);
    expect(curves.lift(0.6, curves.linear(0, 10))(5)).toBeCloseTo(0.8, 10);
    expect(curves.constant(0.4)()).toBe(0.4);
  });
});
