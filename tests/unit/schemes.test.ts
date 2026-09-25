import { describe, expect, it } from 'vitest';
import { POSITIONS } from '../../src/engine/model/positions';
import { RATING_KEYS } from '../../src/engine/model/ratings';
import {
  DEFENSES,
  DEFENSE_LIST,
  OFFENSES,
  OFFENSE_LIST,
  SPECIAL_ROLES
} from '../../src/engine/schemes/catalog';
import { blendRecipes, named, resolveDefense, resolveOffense } from '../../src/engine/schemes/resolve';
import { ROLES, ROLE_IDS } from '../../src/engine/schemes/roles';
import { PLAY_TRIGGERS } from '../../src/engine/schemes/situations';
import {
  DEFENSE_SLOTS,
  OFFENSE_SLOTS,
  defenseSnapShares,
  offenseSnapShares
} from '../../src/engine/schemes/slots';
import {
  blendDefense,
  blendOffense,
  checkDefense,
  checkOffense,
  defenseDistance,
  offenseDistance
} from '../../src/engine/schemes/tendencies';

const sum = (values: Record<string, number | undefined>) =>
  Object.values(values).reduce<number>((a, b) => a + (b ?? 0), 0);

describe('scheme model (spec 7.2)', () => {
  it('has 4 offenses and 4 defenses with valid tendency sliders', () => {
    expect(OFFENSE_LIST).toHaveLength(4);
    expect(DEFENSE_LIST).toHaveLength(4);
    for (const s of OFFENSE_LIST) expect(checkOffense(s.tendencies), s.id).toEqual([]);
    for (const s of DEFENSE_LIST) expect(checkDefense(s.tendencies), s.id).toEqual([]);
  });

  it('catches shares that do not sum to 1 and sliders out of range', () => {
    const bad = structuredClone(OFFENSES.westCoast.tendencies);
    bad.personnel['11'] += 0.1;
    bad.airYards = 30;
    expect(checkOffense(bad)).toEqual([
      expect.stringMatching(/personnel shares sum to 1.100/),
      expect.stringMatching(/airYards 30 is outside/)
    ]);
    const front = { ...DEFENSES.cover3.tendencies, front: 5 as 3 };
    expect(checkDefense(front)).toContainEqual(expect.stringMatching(/front 5/));
  });

  it('blends two schemes as a weighted average that keeps shares summing to 1', () => {
    const a = OFFENSES.westCoast.tendencies;
    const b = OFFENSES.airRaid.tendencies;
    expect(blendOffense(a, b, 1)).toEqual(a);
    expect(blendOffense(a, b, 0)).toEqual(b);
    const mid = blendOffense(a, b, 0.5);
    expect(mid.airYards).toBeCloseTo((a.airYards + b.airYards) / 2);
    expect(checkOffense(mid)).toEqual([]);
    const d = blendDefense(DEFENSES.fourThreeOver.tendencies, DEFENSES.manBlitz.tendencies, 0.7);
    expect(d.front).toBe(4);
    expect(blendDefense(DEFENSES.fourThreeOver.tendencies, DEFENSES.manBlitz.tendencies, 0.3).front).toBe(3);
    expect(checkDefense(d)).toEqual([]);
  });

  it('measures distance between schemes from 0 to 1', () => {
    for (const a of OFFENSE_LIST)
      for (const b of OFFENSE_LIST) {
        const d = offenseDistance(a.tendencies, b.tendencies);
        expect(d).toBeGreaterThanOrEqual(0);
        expect(d).toBeLessThanOrEqual(1);
        expect(d).toBeCloseTo(offenseDistance(b.tendencies, a.tendencies));
        if (a === b) expect(d).toBe(0);
      }
    const air = OFFENSES.airRaid.tendencies;
    expect(offenseDistance(air, OFFENSES.powerRun.tendencies)).toBeGreaterThan(
      offenseDistance(air, OFFENSES.westCoast.tendencies)
    );
    expect(defenseDistance(DEFENSES.cover3.tendencies, DEFENSES.manBlitz.tendencies)).toBeGreaterThan(
      defenseDistance(DEFENSES.cover3.tendencies, DEFENSES.fourThreeOver.tendencies)
    );
  });
});

describe('roles and recipes (spec 7.3)', () => {
  it('gives every recipe rating weights that sum to 1 and a primary it can play', () => {
    for (const id of ROLE_IDS) {
      const role = ROLES[id];
      expect(sum(role.weights), id).toBeCloseTo(1, 10);
      expect(role.eligible, id).toContain(role.primary);
      for (const key of Object.keys(role.weights)) expect(RATING_KEYS, id).toContain(key);
      for (const p of role.eligible) expect(POSITIONS, id).toContain(p);
    }
  });

  it('fills every depth chart slot in every scheme', () => {
    for (const s of OFFENSE_LIST)
      for (const slot of OFFENSE_SLOTS) expect(ROLES[s.roles[slot]]).toBeDefined();
    for (const s of DEFENSE_LIST)
      for (const slot of DEFENSE_SLOTS) expect(ROLES[s.roles[slot]]).toBeDefined();
    for (const id of Object.values(SPECIAL_ROLES)) expect(ROLES[id]).toBeDefined();
  });

  it('uses different backs for zone and power runs', () => {
    expect(OFFENSES.shanahanZone.roles.RB1).toBe('rbZone');
    expect(OFFENSES.powerRun.roles.RB1).toBe('rbPower');
    // Spec 7.3's examples, as written.
    expect(ROLES.rbZone.weights.bcv).toBe(0.25);
    expect((ROLES.rbPower.weights.trk ?? 0) + (ROLES.rbPower.weights.btk ?? 0)).toBeCloseTo(0.35);
  });

  it('blends recipes slot by slot, with weights still summing to 1', () => {
    const blend = blendRecipes(ROLES.rbZone, ROLES.rbPower, 0.7);
    expect(sum(blend.weights)).toBeCloseTo(1, 10);
    expect(blend.label).toBe('Zone runner');
    expect(blend.weights.bcv).toBeCloseTo(0.25 * 0.7 + 0.1 * 0.3);
    const fumble = blend.traits.find(t => t.trait === 'coversBall' && t.value === 'never');
    expect(fumble?.points).toBeCloseTo(-1 * 0.7 + -2 * 0.3);

    const resolved = resolveOffense({ base: 'shanahanZone', blend: 'powerRun', weight: 0.7 });
    expect(resolved.name).toBe('Shanahan outside zone and Power run blend (70/30)');
    expect(resolved.roles.RB1.roleIds).toEqual(['rbZone', 'rbPower']);
    expect(resolved.roles.RB2.roleIds).toEqual(['rbChangeOfPace']);
    expect(checkOffense(resolved.tendencies)).toEqual([]);
    expect(resolveOffense(named('westCoast')).roles.QB.roleIds).toEqual(['qbTiming']);
    expect(resolveDefense(named('cover3')).name).toBe('Cover 3 single-high');
  });
});

describe('snap shares and situation profiles (spec 7.5)', () => {
  it('derives slot snap shares from personnel and packages', () => {
    const wc = offenseSnapShares(OFFENSES.westCoast.tendencies, 0.7);
    expect(wc.QB).toBe(1);
    expect(wc.FB).toBeCloseTo(0.12);
    expect(wc.TE2).toBeCloseTo(0.2 + 0.03 + 0.02);
    expect(wc.SLOT).toBeCloseTo(0.65);
    expect(offenseSnapShares(OFFENSES.airRaid.tendencies, 0.7).FB).toBe(0);
    const d = defenseSnapShares(DEFENSES.manBlitz.tendencies);
    expect(d.NCB).toBeCloseTo(0.75);
    expect(d.FLEX).toBeCloseTo(0.25);
    expect(d.DIME).toBeCloseTo(0.2);
    expect(d.WILL).toBeCloseTo(0.8);
  });

  it('keeps every estimated share between 0 and 1', () => {
    for (const s of OFFENSE_LIST) {
      const profile = resolveOffense(named(s.id)).profile;
      for (const slot of OFFENSE_SLOTS)
        for (const t of PLAY_TRIGGERS) {
          expect(profile[slot][t]).toBeGreaterThanOrEqual(0);
          expect(profile[slot][t]).toBeLessThanOrEqual(1);
        }
    }
    for (const s of DEFENSE_LIST) {
      const profile = resolveDefense(named(s.id)).profile;
      for (const slot of DEFENSE_SLOTS)
        for (const t of PLAY_TRIGGERS) expect(profile[slot][t]).toBeLessThanOrEqual(1);
    }
  });

  it('moves situation shares the way the tendencies do', () => {
    const zone = resolveOffense(named('shanahanZone')).profile;
    const power = resolveOffense(named('powerRun')).profile;
    const air = resolveOffense(named('airRaid')).profile;
    const wc = resolveOffense(named('westCoast')).profile;
    expect(zone.RB1.outsideRun).toBeGreaterThan(power.RB1.outsideRun);
    expect(power.RB1.contactAtLine / power.RB1.carry).toBeGreaterThan(
      zone.RB1.contactAtLine / zone.RB1.carry
    );
    expect(air.QB.deepPass).toBeGreaterThan(wc.QB.deepPass);
    expect(zone.QB.outsidePocket).toBeGreaterThan(air.QB.outsidePocket);
    const man = resolveDefense(named('manBlitz')).profile;
    const c3 = resolveDefense(named('cover3')).profile;
    expect(man.CB1.versusMan).toBeGreaterThan(c3.CB1.versusMan);
    expect(man.MIKE.passRush).toBeGreaterThan(c3.MIKE.passRush);
    expect(c3.FS.deepPass).toBeGreaterThan(resolveDefense(named('fourThreeOver')).profile.FS.deepPass);
  });
});
