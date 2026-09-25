import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseSchedule } from '../../src/data/schedule';
import { pickAbilities, pickCoachAbilities, qualifies } from '../../src/engine/abilities/assign';
import { ABILITIES, ability } from '../../src/engine/abilities/catalog';
import { COACH_ABILITIES } from '../../src/engine/abilities/coaches';
import { createLeague, defaultStartOptions } from '../../src/engine/league/create';
import { POSITIONS } from '../../src/engine/model/positions';
import { RATING_KEYS } from '../../src/engine/model/ratings';
import { STAFF_ROLES } from '../../src/engine/model/staff';
import { stream } from '../../src/engine/rng';
import { TUNING } from '../../src/engine/tuning';
import { nameData } from '../helpers/base-data';
import { typicalPlayer } from '../helpers/fit';

describe('ability catalogs (spec 7.4, 13.1)', () => {
  it('names real positions, ratings, and staff roles', () => {
    for (const a of ABILITIES) {
      for (const p of a.positions) expect(POSITIONS, a.id).toContain(p);
      for (const k of [...Object.keys(a.boosts), ...Object.keys(a.requires)])
        expect(RATING_KEYS, a.id).toContain(k);
    }
    for (const a of COACH_ABILITIES) for (const r of a.roles) expect(STAFF_ROLES, a.id).toContain(r);
  });
});

describe('abilities for generated players (spec 10.2)', () => {
  const elite = typicalPlayer('QB', {
    thp: 25,
    dac: 25,
    sac: 25,
    mac: 25,
    awr: 25,
    tup: 25,
    tor: 25,
    spd: 20
  });

  it('gives none to Normal players and up to three to X-Factors, each qualified', () => {
    const rng = stream(1, 'test');
    expect(pickAbilities(rng, { ...elite, dev: 'Normal' })).toEqual([]);
    const picked = pickAbilities(rng, { ...elite, dev: 'X-Factor' });
    expect(picked).toHaveLength(3);
    expect(new Set(picked).size).toBe(3);
    for (const id of picked) {
      const a = ability(id);
      expect(a?.positions).toContain('QB');
      expect(qualifies(a as NonNullable<typeof a>, elite.ratings)).toBeGreaterThanOrEqual(0);
    }
    const star = typicalPlayer('QB');
    expect(pickAbilities(rng, { ...star, dev: 'Star' })).toEqual([]);
  });

  it('is repeatable for a seed', () => {
    const a = pickAbilities(stream(9, 'x'), { ...elite, dev: 'Superstar' });
    const b = pickAbilities(stream(9, 'x'), { ...elite, dev: 'Superstar' });
    expect(a).toEqual(b);
  });

  it('gives coaches abilities by overall, only ones their role can use', () => {
    const rng = stream(3, 'coach');
    expect(pickCoachAbilities(rng, { role: 'DC', overall: TUNING.abilities.coachOneAt - 1 })).toEqual([]);
    const two = pickCoachAbilities(rng, { role: 'DC', overall: TUNING.abilities.coachTwoAt });
    expect(two).toHaveLength(2);
    for (const id of two) expect(COACH_ABILITIES.find(a => a.id === id)?.roles).toContain('DC');
  });
});

describe('fit in a new league (spec 7.2, 7.6)', () => {
  const schedule = parseSchedule(readFileSync('data-raw/schedule-2026.csv', 'utf8'), 2026);
  const league = createLeague({
    id: 'fit',
    name: 'Fit',
    start: defaultStartOptions('MIN', 21),
    gameVersion: 'test',
    names: nameData(),
    schedule
  });

  it("runs each head coach's schemes and sets the default fit cap", () => {
    expect(league.settings.fitCap).toBe(TUNING.fit.cap);
    for (const team of Object.values(league.teams)) {
      const hc = league.staff[team.staff.HC?.[0] ?? ''];
      expect(team.schemes.offense.base).toBe(hc?.offenseScheme);
      expect(team.schemes.defense.base).toBe(hc?.defenseScheme);
    }
  });

  it('lowers the morale of coordinators who prefer another scheme', () => {
    for (const team of Object.values(league.teams)) {
      const oc = league.staff[team.staff.OC?.[0] ?? ''];
      if (!oc) continue;
      const matches = oc.offenseScheme === team.schemes.offense.base;
      expect(oc.morale, team.abbr).toBe(matches ? TUNING.staff.startMorale : oc.morale);
      if (!matches) expect(oc.morale).toBeLessThan(TUNING.staff.startMorale);
    }
  });

  it('gives abilities to the best players, each one they qualify for', () => {
    const players = Object.values(league.players);
    const withAbilities = players.filter(p => p.abilities.length > 0);
    expect(withAbilities.length).toBeGreaterThan(50);
    expect(withAbilities.length).toBeLessThan(players.length * 0.15);
    for (const p of withAbilities) {
      expect(p.dev).not.toBe('Normal');
      for (const id of p.abilities) {
        const a = ability(id);
        expect(a?.positions, `${p.position} ${id}`).toContain(p.position);
        expect(qualifies(a as NonNullable<typeof a>, p.ratings)).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
