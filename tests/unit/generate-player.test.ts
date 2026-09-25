import { describe, expect, it } from 'vitest';
import { generatePlayer } from '../../src/engine/generate/player';
import { ageOn } from '../../src/engine/model/player';
import { POSITIONS, type Position } from '../../src/engine/model/positions';
import { isValidRating, RATING_KEYS } from '../../src/engine/model/ratings';
import { genContext } from '../helpers/base-data';

const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

describe('player generator (spec 10.2)', () => {
  it('is deterministic for a seed', () => {
    const a = generatePlayer(genContext(7), { position: 'WR', quality: 1, team: 'MIN', status: 'active' });
    const b = generatePlayer(genContext(7), { position: 'WR', quality: 1, team: 'MIN', status: 'active' });
    expect(a).toEqual(b);
  });

  it('produces valid ratings, ages, and identity fields', () => {
    const ctx = genContext(11);
    for (const position of POSITIONS) {
      for (let i = 0; i < 20; i++) {
        const p = generatePlayer(ctx, {
          position,
          quality: ctx.rng.normal(),
          team: null,
          status: 'freeAgent'
        });
        for (const key of RATING_KEYS) expect(isValidRating(p.ratings[key]), `${position} ${key}`).toBe(true);
        expect(isValidRating(p.ovr)).toBe(true);
        expect(p.potential).toBeGreaterThanOrEqual(p.ovr);
        const age = ageOn(p.birthDate, '2026-09-01');
        expect(age).toBeGreaterThanOrEqual(21);
        expect(age).toBeLessThanOrEqual(40);
        expect(p.firstName.length).toBeGreaterThan(0);
        expect(p.lastName.length).toBeGreaterThan(0);
      }
    }
  });

  it('honors a requested age', () => {
    const p = generatePlayer(genContext(3), {
      position: 'QB',
      quality: 0,
      age: 34,
      team: 'KC',
      status: 'active'
    });
    expect(ageOn(p.birthDate, '2026-09-01')).toBe(34);
  });

  it('centers average players near 70 overall and spreads by quality', () => {
    const ctx = genContext(21);
    for (const position of POSITIONS) {
      const at = (quality: number) =>
        mean(
          Array.from(
            { length: 60 },
            () => generatePlayer(ctx, { position, quality, age: 27, team: null, status: 'active' }).ovr
          )
        );
      const average = at(0);
      const star = at(2.5);
      const depth = at(-1.5);
      expect(average, `${position} at quality 0`).toBeGreaterThan(64);
      expect(average, `${position} at quality 0`).toBeLessThan(77);
      expect(star - average, `${position} star gap`).toBeGreaterThan(12);
      expect(average - depth, `${position} depth gap`).toBeGreaterThan(7);
    }
  });

  it('gives each position a realistic build', () => {
    const ctx = genContext(5);
    const build = (position: Position) => {
      const players = Array.from({ length: 80 }, () =>
        generatePlayer(ctx, { position, quality: 0, team: null, status: 'active' })
      );
      return {
        height: mean(players.map(p => p.height)),
        weight: mean(players.map(p => p.weight)),
        speed: mean(players.map(p => p.ratings.spd))
      };
    };
    const lt = build('LT');
    const wr = build('WR');
    const cb = build('CB');
    expect(lt.weight).toBeGreaterThan(300);
    expect(wr.weight).toBeLessThan(215);
    expect(lt.height).toBeGreaterThan(wr.height);
    expect(cb.speed).toBeGreaterThan(lt.speed + 25);
  });

  it('never repeats a full name', () => {
    const ctx = genContext(99);
    const names = new Set<string>();
    for (let i = 0; i < 3000; i++) {
      const p = generatePlayer(ctx, { position: 'WR', quality: 0, team: null, status: 'freeAgent' });
      const key = `${p.firstName} ${p.lastName}`;
      expect(names.has(key)).toBe(false);
      names.add(key);
    }
  });

  it('ties traits to ratings', () => {
    const ctx = genContext(8);
    const qbs = Array.from({ length: 200 }, () =>
      generatePlayer(ctx, { position: 'QB', quality: ctx.rng.normal(), team: null, status: 'active' })
    );
    const smart = qbs.filter(p => p.ratings.awr >= 80);
    const raw = qbs.filter(p => p.ratings.awr < 65);
    const share = (ps: typeof qbs) => ps.filter(p => p.traits.throwAway).length / Math.max(1, ps.length);
    expect(share(smart)).toBeGreaterThan(share(raw));
    expect(new Set(qbs.map(p => p.traits.qbStyle)).size).toBe(3);
  });
});
