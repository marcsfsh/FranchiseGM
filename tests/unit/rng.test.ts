import { describe, expect, it } from 'vitest';
import {
  Rng,
  advanceLeagueRandom,
  createLeagueRandom,
  digestActions,
  freshSeed,
  hashString,
  leagueStream,
  stream
} from '../../src/engine/rng';

const draws = (rng: Rng, n: number) => Array.from({ length: n }, () => rng.nextU32());

describe('Rng', () => {
  it('produces the same sequence for the same seed', () => {
    expect(draws(new Rng(12345), 50)).toEqual(draws(new Rng(12345), 50));
  });

  it('produces different sequences for different seeds', () => {
    expect(draws(new Rng(1), 10)).not.toEqual(draws(new Rng(2), 10));
  });

  it('matches a pinned sequence so the generator never changes silently', () => {
    expect(draws(new Rng(20260910), 4)).toMatchInlineSnapshot(`
      [
        2545706380,
        4242930541,
        3143309917,
        3466744511,
      ]
    `);
  });

  it('resumes from a saved state', () => {
    const a = new Rng(99);
    draws(a, 17);
    const b = new Rng(a.state());
    expect(draws(a, 20)).toEqual(draws(b, 20));
  });

  it('keeps floats in [0, 1) and integers in range', () => {
    const rng = new Rng(7);
    for (let i = 0; i < 5000; i++) {
      const f = rng.float();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const n = rng.int(-3, 3);
      expect(n).toBeGreaterThanOrEqual(-3);
      expect(n).toBeLessThanOrEqual(3);
    }
  });

  it('is roughly uniform and normal', () => {
    const rng = new Rng(314159);
    const buckets = new Array<number>(10).fill(0);
    let sum = 0;
    let sumSq = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const bucket = Math.floor(rng.float() * 10);
      buckets[bucket] = (buckets[bucket] ?? 0) + 1;
      const z = rng.normal();
      sum += z;
      sumSq += z * z;
    }
    for (const count of buckets) expect(Math.abs(count - n / 10)).toBeLessThan(n / 10 / 8);
    expect(Math.abs(sum / n)).toBeLessThan(0.03);
    expect(Math.abs(Math.sqrt(sumSq / n) - 1)).toBeLessThan(0.03);
  });

  it('picks by weight and never picks a zero weight', () => {
    const rng = new Rng(5);
    const counts = [0, 0, 0];
    for (let i = 0; i < 6000; i++) {
      const index = rng.weightedIndex([1, 0, 3]);
      counts[index] = (counts[index] ?? 0) + 1;
    }
    expect(counts[1]).toBe(0);
    expect((counts[2] ?? 0) / (counts[0] ?? 1)).toBeGreaterThan(2.5);
    expect((counts[2] ?? 0) / (counts[0] ?? 1)).toBeLessThan(3.5);
    expect(() => rng.weightedIndex([0, 0])).toThrow(RangeError);
  });

  it('shuffles deterministically and keeps every element', () => {
    const a = new Rng(11).shuffle([1, 2, 3, 4, 5, 6, 7, 8]);
    const b = new Rng(11).shuffle([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(a).toEqual(b);
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe('sub-streams', () => {
  it('are independent of how much another stream has drawn', () => {
    const gameA = stream(42, 'game', 1);
    draws(gameA, 1000);
    const gameB1 = draws(stream(42, 'game', 2), 10);
    const gameB2 = draws(stream(42, 'game', 2), 10);
    expect(gameB1).toEqual(gameB2);
  });

  it('differ by key path', () => {
    expect(draws(stream(42, 'game', 1), 5)).not.toEqual(draws(stream(42, 'game', 2), 5));
    expect(draws(stream(42, 'game', 1), 5)).not.toEqual(draws(stream(42, 'draft', 1), 5));
  });
});

describe('weighted seed and fixed mode', () => {
  const advanceTwice = (fixed: boolean, entropy: number, actions: unknown[]) => {
    let random = createLeagueRandom(2026, fixed);
    random = advanceLeagueRandom(random, { actions: digestActions(actions), entropy });
    random = advanceLeagueRandom(random, { actions: digestActions([]), entropy: entropy + 1 });
    return random;
  };

  it('replays exactly in fixed mode, whatever the nonce inputs', () => {
    const a = advanceTwice(true, 1, [{ type: 'depth', slot: 'QB1' }]);
    const b = advanceTwice(true, 999, []);
    expect(a.advanceSeed).toBe(b.advanceSeed);
    expect(draws(leagueStream(a, 'game', 3), 20)).toEqual(draws(leagueStream(b, 'game', 3), 20));
  });

  it('gives the same random sequence across runs for the same seed in fixed mode', () => {
    const run = () => {
      let random = createLeagueRandom(777, true);
      const out: number[] = [];
      for (let week = 0; week < 5; week++) {
        random = advanceLeagueRandom(random, { actions: 0, entropy: freshSeed() });
        out.push(...draws(leagueStream(random, 'game', week), 3));
      }
      return out;
    };
    expect(run()).toEqual(run());
  });

  it('varies with the nonce in weighted mode', () => {
    const a = advanceTwice(false, 1, []);
    const b = advanceTwice(false, 2, []);
    const c = advanceTwice(false, 1, [{ type: 'depth', slot: 'QB1' }]);
    expect(a.advanceSeed).not.toBe(b.advanceSeed);
    expect(a.advanceSeed).not.toBe(c.advanceSeed);
  });

  it('is repeatable in weighted mode when every nonce input matches', () => {
    expect(advanceTwice(false, 5, ['x']).advanceSeed).toBe(advanceTwice(false, 5, ['x']).advanceSeed);
  });

  it('advances the league stream only in weighted mode', () => {
    const fixed = createLeagueRandom(3, true);
    const weighted = createLeagueRandom(3, false);
    expect(advanceLeagueRandom(fixed, { actions: 0, entropy: 0 }).league).toEqual(fixed.league);
    expect(advanceLeagueRandom(weighted, { actions: 0, entropy: 0 }).league).not.toEqual(weighted.league);
  });
});

describe('hashing', () => {
  it('is stable', () => {
    expect(hashString('Franchise GM')).toBe(hashString('Franchise GM'));
    expect(hashString('a')).not.toBe(hashString('b'));
    expect(freshSeed()).toBeGreaterThanOrEqual(0);
  });
});
