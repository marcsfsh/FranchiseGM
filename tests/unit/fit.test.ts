import { describe, expect, it } from 'vitest';
import { ABILITIES, ability } from '../../src/engine/abilities/catalog';
import { coachEffects } from '../../src/engine/abilities/coaches';
import { abilityWorth, triggerRate } from '../../src/engine/abilities/value';
import { adaptedTendencies, autoLineup, coordinatorFit, teamCohesion } from '../../src/engine/fit/cohesion';
import { REFERENCES } from '../../src/engine/fit/reference';
import { recipeFor, roleRating, rolesFor } from '../../src/engine/fit/role-rating';
import { POSITIONS } from '../../src/engine/model/positions';
import { RATING_KEYS } from '../../src/engine/model/ratings';
import { stream } from '../../src/engine/rng';
import { FIT_SLOTS } from '../../src/engine/schemes/slots';
import type { StaffMember } from '../../src/engine/model/staff';
import { named, referenceProfile, resolveOffense } from '../../src/engine/schemes/resolve';
import { CONTEXT_SHARES, PLAY_TRIGGERS, type SituationShares } from '../../src/engine/schemes/situations';
import { DEFENSE_SLOTS, OFFENSE_SLOTS, defenseSnapShares } from '../../src/engine/schemes/slots';
import { TUNING } from '../../src/engine/tuning';
import { fitContext, typicalPlayer } from '../helpers/fit';

describe('role rating math (spec 7.3)', () => {
  it('rates a typical player at his own overall in every role his position anchors', () => {
    for (const offense of ['westCoast', 'shanahanZone', 'airRaid', 'powerRun'] as const) {
      const ctx = fitContext(offense);
      for (const slot of [...OFFENSE_SLOTS, ...DEFENSE_SLOTS]) {
        const recipe = recipeFor(ctx, slot);
        const player = typicalPlayer(recipe.primary);
        const r = roleRating(player, slot, ctx);
        expect(Math.abs(r.fit), `${offense} ${slot} ${recipe.label}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('adds the stretched weight of each rating above the typical player', () => {
    const ctx = fitContext('shanahanZone');
    const plain = typicalPlayer('HB');
    const visionary = typicalPlayer('HB', { bcv: 10 });
    const before = roleRating(plain, 'RB1', ctx);
    const after = roleRating(visionary, 'RB1', ctx);
    const scale = REFERENCES.HB.scale;
    // Vision is 25% of the zone recipe and 13/115 of the HB overall formula.
    expect(after.rating - before.rating).toBeCloseTo(scale * 0.25 * 10, -0.5);
    expect(after.fit - before.fit).toBeCloseTo(scale * (0.25 - 13 / 115) * 10, -0.5);
    expect(after.strengths[0]?.key).toBe('bcv');
  });

  it('holds the spec 7.3 example: an agile, high-vision back is a zone runner, a power back is not', () => {
    const agile = typicalPlayer('HB', {
      bcv: 12,
      agi: 10,
      cod: 10,
      jkm: 8,
      spm: 6,
      trk: -10,
      btk: -8,
      str: -8,
      sfa: -8
    });
    const bruiser = typicalPlayer('HB', {
      bcv: -8,
      agi: -8,
      cod: -8,
      jkm: -8,
      trk: 12,
      btk: 10,
      str: 10,
      sfa: 10
    });
    const zone = fitContext('shanahanZone');
    const power = fitContext('powerRun');
    expect(roleRating(agile, 'RB1', zone).rating).toBeGreaterThan(roleRating(agile, 'RB1', power).rating);
    expect(roleRating(bruiser, 'RB1', power).rating).toBeGreaterThan(roleRating(bruiser, 'RB1', zone).rating);
    expect(roleRating(agile, 'RB1', zone).fit).toBeGreaterThan(0);
    expect(roleRating(agile, 'RB1', power).fit).toBeLessThan(0);
    expect(roleRating(bruiser, 'RB1', power).fit).toBeGreaterThan(0);
  });

  it("measures a player out of position against the role's own position", () => {
    // A typical end has less coverage than a typical outside linebacker, so he fits a 3-4 OLB role worse.
    const end = typicalPlayer('LE');
    const ctx = fitContext('westCoast', 'threeFourOneGap');
    expect(roleRating(end, 'LEDGE', ctx).fit).toBeLessThan(0);
    // He can line up at end or edge; his best 3-4 role is 5-technique end.
    const roles = rolesFor(end, ctx, DEFENSE_SLOTS);
    expect(roles.map(r => r.slot)).toEqual(expect.arrayContaining(['DT1', 'FLEX', 'LEDGE', 'REDGE']));
    expect(roles[0]?.label).toBe('5-technique end');
  });
});

describe('trait adjustments (spec 7.3)', () => {
  it('rewards or penalizes the same trait differently by scheme', () => {
    const gunslinger = typicalPlayer('QB', {}, { forcesPasses: 'aggressive' });
    const plain = typicalPlayer('QB');
    const wc = fitContext('westCoast');
    const power = fitContext('powerRun');
    const wcDiff = roleRating(gunslinger, 'QB', wc).rating - roleRating(plain, 'QB', wc).rating;
    const powerDiff = roleRating(gunslinger, 'QB', power).rating - roleRating(plain, 'QB', power).rating;
    expect(wcDiff).toBe(-2);
    expect(powerDiff).toBe(1);
    expect(roleRating(gunslinger, 'QB', wc).traits).toEqual([
      { label: 'forces passes', points: -2, source: 'role' }
    ]);
  });

  it('matches style traits directly', () => {
    const rusher = typicalPlayer('LOLB', {}, { lbStyle: 'passRush' });
    const cover = typicalPlayer('LOLB', {}, { lbStyle: 'cover' });
    const ctx = fitContext('westCoast', 'threeFourOneGap');
    expect(roleRating(rusher, 'LEDGE', ctx).parts.traits).toBe(2);
    expect(roleRating(cover, 'LEDGE', ctx).parts.traits).toBe(-1);
  });
});

describe('ability value (spec 7.3, 7.4)', () => {
  const shares = (values: Partial<SituationShares>): SituationShares => {
    const out = Object.fromEntries(PLAY_TRIGGERS.map(t => [t, 0])) as SituationShares;
    return { ...out, ...values };
  };

  it('has a starter catalog of about 20 abilities with triggers and effects', () => {
    expect(ABILITIES.length).toBeGreaterThanOrEqual(20);
    expect(new Set(ABILITIES.map(a => a.id)).size).toBe(ABILITIES.length);
    for (const a of ABILITIES) {
      expect([1, 2, 3]).toContain(a.tier);
      expect(a.triggers.length).toBeGreaterThan(0);
      expect(Object.keys(a.boosts).length).toBeGreaterThan(0);
    }
  });

  it('triggers on any of its situations, inside any of its contexts', () => {
    const both = { triggers: ['openField', 'deepPass'] as const };
    expect(triggerRate(both, shares({ openField: 0.2, deepPass: 0.1 }))).toBeCloseTo(1 - 0.8 * 0.9);
    const late = { triggers: ['kick'] as const, contexts: ['lateAndClose'] as const };
    expect(triggerRate(late, shares({ kick: 1 }))).toBeCloseTo(CONTEXT_SHARES.lateAndClose);
    expect(triggerRate(both, shares({ openField: 0.2 }), { openField: 1.5 })).toBeCloseTo(0.3);
  });

  it('is worth its tier points at the average trigger rate, more where it triggers more', () => {
    const slippery = ability('slippery');
    if (!slippery) throw new Error('missing ability');
    const reference = shares({ openField: 0.1 });
    expect(abilityWorth(slippery, reference, reference).points).toBeCloseTo(2);
    expect(abilityWorth(slippery, shares({ openField: 0.15 }), reference).points).toBeCloseTo(3);
    // A scheme can at most double an ability's worth.
    expect(abilityWorth(slippery, shares({ openField: 0.9 }), reference).points).toBe(
      2 * TUNING.abilities.maxFrequencyRatio
    );
    expect(abilityWorth(slippery, shares({}), shares({})).points).toBe(0);
  });

  it('values an elusive back more in the outside zone than in the power scheme', () => {
    const back = typicalPlayer('HB', {}, {}, ['slippery']);
    const zone = roleRating(back, 'RB1', fitContext('shanahanZone'));
    const power = roleRating(back, 'RB1', fitContext('powerRun'));
    expect(zone.abilities[0]?.points).toBeGreaterThan(power.abilities[0]?.points ?? 0);
    expect(zone.abilities[0]?.ratio).toBeGreaterThan(1);
    expect(power.abilities[0]?.ratio).toBeLessThan(1);
  });

  it('uses the named-scheme average as the reference for each slot', () => {
    const openField = OFFENSE_SLOTS.map(slot => referenceProfile().offense[slot].openField);
    expect(Math.min(...openField)).toBeGreaterThanOrEqual(0);
    const rb = ['westCoast', 'shanahanZone', 'airRaid', 'powerRun'].map(
      id => resolveOffense(named(id as 'westCoast')).profile.RB1.openField
    );
    expect(referenceProfile().offense.RB1.openField).toBeCloseTo(rb.reduce((a, b) => a + b, 0) / 4);
  });
});

describe('caps (spec 7.3)', () => {
  it('caps role ratings at 99 and fit at the league setting', () => {
    const star = typicalPlayer(
      'HB',
      { bcv: 60, agi: 60, cod: 60, acc: 60, jkm: 60, spm: 60, spd: 60, car: 60 },
      {},
      ['slippery', 'afterburner']
    );
    const r = roleRating(star, 'RB1', fitContext('shanahanZone', 'fourThreeOver', 3));
    expect(r.rating).toBeLessThanOrEqual(99);
    const agile = typicalPlayer('HB', { bcv: 15, agi: 15, cod: 15, jkm: 10, trk: -15, btk: -15 });
    const capped = roleRating(agile, 'RB1', fitContext('shanahanZone', 'fourThreeOver', 3));
    const open = roleRating(agile, 'RB1', fitContext('shanahanZone', 'fourThreeOver', 20));
    expect(capped.fit).toBe(3);
    expect(capped.capped).toBe(true);
    expect(open.fit).toBeGreaterThan(3);
    expect(open.capped).toBe(false);
    const low = roleRating(agile, 'RB1', fitContext('powerRun', 'fourThreeOver', 3));
    expect(low.fit).toBe(-3);
  });

  it('explains the fit with parts that add up to the role rating', () => {
    const back = typicalPlayer('HB', { bcv: 8, agi: 6 }, { yacCatch: true, coversBall: 'never' }, [
      'slippery'
    ]);
    const r = roleRating(back, 'RB1', fitContext('shanahanZone'));
    const total = back.ovr + r.parts.ratings + r.parts.traits + r.parts.abilities;
    expect(Math.abs(Math.round(total) - r.rating)).toBeLessThanOrEqual(1);
    expect(r.traits.map(t => t.label).sort()).toEqual(['YAC catch', 'fumble prone']);
    expect(r.abilities.map(a => a.name)).toEqual(['Slippery']);
  });
});

const coach = (
  role: StaffMember['role'],
  abilities: string[],
  extra: Partial<StaffMember> = {}
): StaffMember => ({
  id: `s-${role}`,
  firstName: 'Pat',
  lastName: 'Coach',
  birthDate: '1970-01-01',
  role,
  team: 'MIN',
  ratings: { flexibility: 50 },
  overall: 80,
  abilities,
  offenseScheme: null,
  defenseScheme: null,
  personality: {},
  tendencies: null,
  morale: 70,
  contract: { years: 3, salary: 1_000_000 },
  record: { wins: 0, losses: 0, ties: 0, playoffWins: 0, playoffLosses: 0, titles: 0 },
  yearsInRole: 1,
  region: null,
  ...extra
});

describe('coach abilities, cohesion, and coordinators (spec 7.6)', () => {
  it('opens trigger situations and boosts traits for the right players', () => {
    const effects = coachEffects([coach('DC', ['pressureDesigner']), coach('HC', ['disciplinarian'])]);
    expect(effects.defense.passRush).toBeCloseTo(1.15);
    const rusher = typicalPlayer('LE', {}, {}, ['edgeBurst']);
    const base = fitContext('westCoast', 'fourThreeOver');
    const withCoach = { ...base, coaches: effects };
    const a = roleRating(rusher, 'LEDGE', base);
    const b = roleRating(rusher, 'LEDGE', withCoach);
    expect(b.parts.abilities).toBeGreaterThan(a.parts.abilities);
    expect(b.coach).toBeCloseTo(b.parts.abilities - a.parts.abilities);
    const sloppy = typicalPlayer('LT', {}, { penalty: 'undisciplined' });
    const r = roleRating(sloppy, 'LT', withCoach);
    expect(r.traits).toContainEqual({ label: 'penalties coached out', points: 1, source: 'coach' });
    expect(r.coach).toBe(1);
    // An ability held in a role that can't use it does nothing.
    expect(coachEffects([coach('SCOUT', ['pressureDesigner'])]).sources).toEqual([]);
  });

  it('builds a lineup with one player per slot and the best role ratings first', () => {
    const ctx = fitContext('shanahanZone', 'fourThreeOver');
    const players = [
      typicalPlayer('HB', { bcv: 10, agi: 8 }),
      typicalPlayer('HB', { trk: 10, btk: 10 }),
      typicalPlayer('QB'),
      typicalPlayer('FB')
    ];
    const lineup = autoLineup(players, ctx, ['QB', 'RB1', 'RB2', 'FB']);
    expect(lineup.get('RB1')?.player).toBe(players[0]);
    expect(new Set([...lineup.values()].map(e => e.player.id)).size).toBe(lineup.size);
    expect(lineup.get('QB')?.player).toBe(players[2]);
  });

  it('weights cohesion by snaps, clamps it, and lets flexibility cost part of the bonus', () => {
    const ctx = fitContext('shanahanZone', 'fourThreeOver');
    const players = [...OFFENSE_SLOTS, ...DEFENSE_SLOTS].map(slot =>
      typicalPlayer(recipeFor(ctx, slot).primary, { bcv: 20, agi: 20, rbf: 20, zcv: 20, fmv: 20, pmv: 20 })
    );
    const lineup = autoLineup(
      players.map((p, i) => ({ ...p, id: `p${i}` })),
      ctx
    );
    const rigid = teamCohesion(lineup, ctx, 0);
    const flexible = teamCohesion(lineup, ctx, 99);
    expect(Math.abs(rigid.offense.value)).toBeLessThanOrEqual(TUNING.cohesion.limit);
    expect(rigid.offense.execution).toBeCloseTo(rigid.offense.value * TUNING.cohesion.executionPerPoint);
    if (rigid.offense.value > 0) expect(flexible.offense.value).toBeLessThan(rigid.offense.value);
    const typical = autoLineup(
      [...OFFENSE_SLOTS, ...DEFENSE_SLOTS].map((slot, i) => ({
        ...typicalPlayer(recipeFor(ctx, slot).primary),
        id: `t${i}`
      })),
      ctx
    );
    expect(Math.abs(teamCohesion(typical, ctx, 50).offense.fit)).toBeLessThanOrEqual(1);
  });

  it('costs a coordinator in proportion to the distance from his preferred scheme', () => {
    const schemes = { offense: named('airRaid'), defense: named('cover3') } as const;
    const same = coordinatorFit(coach('OC', [], { offenseScheme: 'airRaid' }), schemes);
    const near = coordinatorFit(coach('OC', [], { offenseScheme: 'westCoast' }), schemes);
    const far = coordinatorFit(coach('OC', [], { offenseScheme: 'powerRun' }), schemes);
    expect(same?.distance).toBe(0);
    expect(same?.morale).toBe(0);
    expect(far?.distance).toBeGreaterThan(near?.distance ?? 1);
    expect(far?.playCalling).toBeLessThan(near?.playCalling ?? 0);
    expect(far?.morale).toBeLessThan(0);
    expect(far?.playCalling).toBeCloseTo(1 - TUNING.coordinators.playCallingPenalty * (far?.distance ?? 0));
    expect(coordinatorFit(coach('HC', []), schemes)).toBeNull();
    const dc = coordinatorFit(coach('DC', [], { defenseScheme: 'manBlitz' }), schemes);
    expect(dc?.distance).toBeGreaterThan(0.3);
  });

  it('bends a flexible coach toward what the roster does well, and not a rigid one', () => {
    const ctx = fitContext('airRaid', 'fourThreeOver');
    const zoneRoster = [...OFFENSE_SLOTS].map((slot, i) => {
      const primary = recipeFor(fitContext('shanahanZone'), slot).primary;
      return { ...typicalPlayer(primary, { bcv: 15, agi: 12, rbf: 15, pac: 15, tor: 12 }), id: `z${i}` };
    });
    const rigid = adaptedTendencies(zoneRoster, ctx, 0);
    expect(rigid.offense).toBe(ctx.offense.tendencies);
    const flexible = adaptedTendencies(zoneRoster, ctx, 99);
    expect(flexible.bend).toBeCloseTo(TUNING.cohesion.maxBend);
    expect(flexible.offense.runConcepts.outsideZone).toBeGreaterThan(
      ctx.offense.tendencies.runConcepts.outsideZone
    );
  });
});

describe('review fixes (M3)', () => {
  it('keeps fit equal to role rating minus overall, within the cap, for any player and role', () => {
    const rng = stream(77, 'fit-property');
    for (let i = 0; i < 150; i++) {
      const position = POSITIONS[i % POSITIONS.length] as (typeof POSITIONS)[number];
      const adjust = Object.fromEntries(RATING_KEYS.map(k => [k, Math.round(rng.normal(0, 12))]));
      const player = typicalPlayer(position, adjust, { penalty: 'undisciplined', coversBall: 'never' });
      const cap = 2 + (i % 9);
      const ctx = fitContext(i % 2 ? 'airRaid' : 'powerRun', i % 3 ? 'manBlitz' : 'cover3', cap);
      for (const slot of FIT_SLOTS) {
        if (!recipeFor(ctx, slot).eligible.includes(position)) continue;
        const r = roleRating(player, slot, ctx);
        expect(r.fit).toBe(r.rating - player.ovr);
        expect(Math.abs(r.fit)).toBeLessThanOrEqual(cap);
        expect(r.rating).toBeGreaterThanOrEqual(0);
        expect(r.rating).toBeLessThanOrEqual(99);
      }
    }
  });

  it('lets a coach offset a flaw only where the role penalizes it', () => {
    const effects = coachEffects([coach('HC', ['disciplinarian'])]);
    const ctx = { ...fitContext('westCoast'), coaches: effects };
    const sloppyQb = typicalPlayer('QB', {}, { penalty: 'undisciplined' });
    const cleanQb = typicalPlayer('QB');
    // The timing passer recipe doesn't penalize penalties, so the coach adds nothing.
    expect(roleRating(sloppyQb, 'QB', ctx).rating).toBe(roleRating(cleanQb, 'QB', ctx).rating);
    expect(roleRating(sloppyQb, 'QB', ctx).coach).toBe(0);
    // A lineman's -2 becomes -1, never better than a disciplined-neutral lineman.
    const sloppyLt = roleRating(typicalPlayer('LT', {}, { penalty: 'undisciplined' }), 'LT', ctx);
    expect(sloppyLt.parts.traits).toBe(-1);
  });

  it("heads a player's roles with his own position's roles", () => {
    const ctx = fitContext('westCoast', 'fourThreeOver');
    const kicker = typicalPlayer('K', { kpw: 10, kac: 10 });
    expect(rolesFor(kicker, ctx, FIT_SLOTS)[0]?.label).toBe('Kicker');
    const center = typicalPlayer('C', { pbk: 8, rbp: 8, str: 8 });
    expect(rolesFor(center, ctx, FIT_SLOTS)[0]?.slot).toBe('C');
    const corner = typicalPlayer('CB', { zcv: 10, prc: 10, tak: 10 });
    expect(rolesFor(corner, ctx, FIT_SLOTS)[0]?.label).not.toBe('Dime back');
    const guard = typicalPlayer('RG');
    expect(['LG', 'RG']).toContain(rolesFor(guard, ctx, FIT_SLOTS)[0]?.slot);
  });

  it('fills the most-played slots first', () => {
    const ctx = fitContext('westCoast', 'fourThreeOver');
    const star = { ...typicalPlayer('CB', { mcv: 20, zcv: 20, spd: 10, prc: 15, tak: 15 }), id: 'star' };
    const others = [0, 1, 2].map(i => ({ ...typicalPlayer('CB', { mcv: -i }), id: `cb${i}` }));
    const lineup = autoLineup([star, ...others], ctx, ['CB1', 'CB2', 'NCB', 'DIME']);
    expect(['star']).toContain(lineup.get('CB1')?.player.id);
    const lead = { ...typicalPlayer('HB', { bcv: 12, spd: 8, acc: 8, car: 10 }), id: 'lead' };
    const backup = { ...typicalPlayer('HB', { bcv: -10, spd: -10 }), id: 'backup' };
    const backs = autoLineup([backup, lead], ctx, ['RB2', 'RB1']);
    expect(backs.get('RB1')?.player.id).toBe('lead');
  });

  it('counts coach points once in cohesion', () => {
    const ctx = {
      ...fitContext('westCoast', 'fourThreeOver'),
      coaches: coachEffects([coach('DC', ['pressureDesigner'])])
    };
    const players = [...OFFENSE_SLOTS, ...DEFENSE_SLOTS].map((slot, i) => ({
      ...typicalPlayer(recipeFor(ctx, slot).primary, {}, {}, ['edgeBurst']),
      id: `c${i}`
    }));
    const lineup = autoLineup(players, ctx);
    const c = teamCohesion(lineup, ctx, 0);
    const shares = defenseSnapShares(ctx.defense.tendencies);
    let fit = 0;
    let coachPoints = 0;
    let weight = 0;
    for (const slot of DEFENSE_SLOTS) {
      const entry = lineup.get(slot);
      if (!entry || shares[slot] <= 0) continue;
      weight += shares[slot];
      fit += shares[slot] * entry.role.fit;
      coachPoints += shares[slot] * entry.role.coach;
    }
    expect(coachPoints).toBeGreaterThan(0);
    // The starters' fit already includes the coach's points; cohesion splits them out, not adds them.
    expect(c.defense.fit + c.defense.coaching).toBeCloseTo(fit / weight);
    expect(c.defense.coaching).toBeCloseTo(coachPoints / weight);
  });
});
