import { describe, expect, it } from 'vitest';
import measured from '../../src/data/situation-profiles.json';
import { DEFENSE_SCHEMES, OFFENSE_SCHEMES } from '../../src/engine/schemes/ids';
import { named, REFERENCE_PROFILE, resolveDefense, resolveOffense } from '../../src/engine/schemes/resolve';
import { PLAY_TRIGGERS } from '../../src/engine/schemes/situations';
import { DEFENSE_SLOTS, OFFENSE_SLOTS } from '../../src/engine/schemes/slots';

const file = measured as unknown as {
  status: string;
  offense: Record<string, Record<string, Record<string, number>>>;
  defense: Record<string, Record<string, Record<string, number>>>;
};

describe('measured situation profiles (spec 7.5)', () => {
  it('covers every named scheme, slot, and trigger with shares from 0 to 1', () => {
    expect(file.status).toBe('measured');
    for (const id of OFFENSE_SCHEMES)
      for (const slot of OFFENSE_SLOTS)
        for (const t of PLAY_TRIGGERS) {
          const v = file.offense[id]?.[slot]?.[t];
          expect(v, `${id} ${slot} ${t}`).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
    for (const id of DEFENSE_SCHEMES)
      for (const slot of DEFENSE_SLOTS) expect(file.defense[id]?.[slot]).toBeDefined();
  });

  it('looks like football: quarterbacks drop back on most snaps, linemen block on all of them', () => {
    for (const id of OFFENSE_SCHEMES) {
      const qb = file.offense[id]?.QB as Record<string, number>;
      expect(qb.dropback).toBeGreaterThan(0.45);
      expect(qb.dropback).toBeLessThan(0.75);
      const lt = file.offense[id]?.LT as Record<string, number>;
      expect((lt.passRush ?? 0) + (lt.insideRun ?? 0) + (lt.outsideRun ?? 0)).toBeGreaterThan(0.9);
    }
  });

  it('is what named schemes resolve to, mixed for blends, and averaged for the reference', () => {
    expect(resolveOffense(named('airRaid')).profile).toEqual(file.offense.airRaid);
    expect(resolveDefense(named('cover3')).profile).toEqual(file.defense.cover3);
    const blend = resolveOffense({ base: 'westCoast', blend: 'powerRun', weight: 0.75 }).profile;
    const wc = file.offense.westCoast?.RB1?.carry as number;
    const power = file.offense.powerRun?.RB1?.carry as number;
    expect(blend.RB1.carry).toBeCloseTo(wc * 0.75 + power * 0.25);
    const mean = OFFENSE_SCHEMES.reduce((sum, id) => sum + (file.offense[id]?.QB?.dropback as number), 0) / 4;
    expect(REFERENCE_PROFILE.offense.QB.dropback).toBeCloseTo(mean);
  });
});
