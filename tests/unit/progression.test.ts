import { describe, expect, it } from 'vitest';
import type { League } from '../../src/engine/league/types';
import type { GameDate } from '../../src/engine/model/calendar';
import type { Player } from '../../src/engine/model/player';
import {
  ageCurve,
  campDevelopment,
  developPlayer,
  weeklyDevelopment
} from '../../src/engine/progression/develop';
import {
  AGE_BRACKETS,
  bracketLabel,
  bracketOf,
  declineMultiplier,
  defaultDevelopment,
  growthMultiplier
} from '../../src/engine/progression/settings';
import { autoTraining, focusOf, playerFocus } from '../../src/engine/progression/training';
import { stream } from '../../src/engine/rng';
import { TUNING } from '../../src/engine/tuning';
import { situationLeague } from '../helpers/situations';

// Progression and regression (spec 10.5): age curves by rating class, the drivers, the settings, and training.
const camp: GameDate = { season: 2026, phase: 'trainingCamp', week: 1 };
const fresh = (): League => {
  const league = structuredClone(situationLeague);
  league.date = { ...camp };
  return league;
};
const born = (age: number) => `${2027 - age}-03-01`;
/** A copy of a player at an age, room to potential, and development trait. */
const shaped = (
  league: League,
  base: Player,
  age: number,
  room: number,
  dev: Player['dev'] = 'Normal'
): Player => {
  const p = structuredClone(base);
  Object.assign(p, { birthDate: born(age), potential: p.ovr + room, dev, injury: null });
  league.players[p.id] = p;
  return p;
};
/** The average overall change over many camps, each from the same start. */
function averageCamp(league: League, make: () => Player, n = 120): number {
  let total = 0;
  for (let i = 0; i < n; i++) {
    const p = make();
    const before = p.ovr;
    developPlayer(
      league,
      p,
      { kind: 'camp', share: TUNING.progression.campShare, snaps: 0.9 },
      stream(i, 'camp')
    );
    total += p.ovr - before;
  }
  return total / n;
}

describe('age curves (spec 10.5)', () => {
  it('fades growth and builds decline, speed first and the mind last', () => {
    expect(ageCurve('skill', -5).growth).toBeGreaterThan(ageCurve('skill', 0).growth);
    expect(ageCurve('skill', 8).decline).toBeGreaterThan(ageCurve('skill', 2).decline);
    expect(ageCurve('speed', 3).decline).toBeGreaterThan(ageCurve('mind', 3).decline);
    expect(ageCurve('mind', 0).growth).toBeGreaterThan(ageCurve('speed', 0).growth);
  });

  it('reads the settings tables by age bracket and position group, times their speeds', () => {
    expect(AGE_BRACKETS.map((_, i) => bracketLabel(i))).toEqual(['22 and under', '23 to 24', '25 to 26', '27 to 28', '29 to 30', '31 to 32', '33 to 34', '35 and over']); // prettier-ignore
    expect([21, 22, 23, 26, 35, 40].map(bracketOf)).toEqual([0, 0, 1, 2, 7, 7]);
    const s = defaultDevelopment();
    expect(growthMultiplier(s, 24, 'WR')).toBe(1);
    s.progressionByAge[1] = 1.5;
    s.progressionByPosition.WR = 0.5;
    s.speed.progressionPosition = 2;
    s.regressionByAge[7] = 0;
    expect(growthMultiplier(s, 24, 'WR')).toBe(1.5);
    expect(growthMultiplier(s, 26, 'QB')).toBe(2);
    expect(declineMultiplier(s, 36, 'QB')).toBe(0);
  });
});

describe('development drivers (spec 10.5)', () => {
  const base = () => Object.values(situationLeague.players).find(p => p.team === 'MIN' && p.position === 'WR' && p.status === 'active') as Player; // prettier-ignore

  it('grows the young with room and a better trait, and takes from the old', () => {
    const league = fresh();
    const young = averageCamp(league, () => shaped(league, base(), 22, 10));
    const capped = averageCamp(league, () => shaped(league, base(), 22, 0));
    const star = averageCamp(league, () => shaped(league, base(), 22, 10, 'X-Factor'));
    const old = averageCamp(league, () => shaped(league, base(), 33, 0));
    expect(young).toBeGreaterThan(1);
    expect(capped).toBeLessThan(young);
    expect(star).toBeGreaterThan(young);
    expect(old).toBeLessThan(-1);
  });

  it('follows the settings: no progression at 0%, faster regression at 200%', () => {
    const league = fresh();
    league.settings.development.speed.progressionAge = 0;
    const none = averageCamp(league, () => shaped(league, base(), 22, 10));
    league.settings.development = defaultDevelopment();
    const normalOld = averageCamp(league, () => shaped(league, base(), 33, 0));
    league.settings.development.speed.regressionPosition = 2;
    const fasterOld = averageCamp(league, () => shaped(league, base(), 33, 0));
    expect(Math.abs(none)).toBeLessThan(0.6);
    expect(fasterOld).toBeLessThan(normalOld - 0.5);
  });

  it('records the change for camp with its largest drivers in overall points', () => {
    const league = fresh();
    const p = shaped(league, base(), 22, 10, 'Star');
    const change = developPlayer(
      league,
      p,
      { kind: 'camp', share: TUNING.progression.campShare, snaps: 1 },
      stream(3, 'camp')
    );
    expect(change).toMatchObject({ playerId: p.id, cause: 'camp' });
    expect(change?.drivers.length).toBeGreaterThan(0);
    expect(change?.drivers.map(d => d.id)).toContain('age');
    expect(change?.drivers.every(d => Number.isFinite(d.amount))).toBe(true);
  });
});

describe('training (spec 10.5)', () => {
  it('puts more of the growth into a focus', () => {
    const league = fresh();
    league.date = { season: 2026, phase: 'regularSeason', week: 3 };
    const wr = Object.values(league.players).find(p => p.team === 'MIN' && p.position === 'WR' && p.status === 'active') as Player; // prettier-ignore
    const focus = focusOf('routeRunning');
    const gain = (focused: boolean) => {
      league.teams.MIN.training.units.offense = focused ? 'routeRunning' : 'balanced';
      let total = 0;
      for (let i = 0; i < 200; i++) {
        const p = shaped(league, wr, 22, 10);
        const before = focus.ratings.reduce((s, k) => s + p.ratings[k], 0);
        developPlayer(league, p, { kind: 'weekly', share: 0.05, snaps: 1 }, stream(i, 'week'));
        total += focus.ratings.reduce((s, k) => s + p.ratings[k], 0) - before;
      }
      return total;
    };
    expect(gain(true)).toBeGreaterThan(gain(false) * 1.5);
  });

  it("lets the coaches set every unit's focus, young players' own, and a program by the roster's age", () => {
    const league = fresh();
    const plan = autoTraining(league, 'MIN');
    expect(plan.auto).toBe(true);
    for (const unit of ['offense', 'defense', 'special'] as const) {
      expect(plan.units[unit]).not.toBe('balanced');
      expect(focusOf(plan.units[unit]).units).toContain(unit);
    }
    expect(['technique', 'film', 'strength']).toContain(plan.program);
    const young = Object.values(league.players).find(p => p.team === 'MIN' && plan.players[p.id]);
    if (young) expect(playerFocus(plan, young).id).toBe(plan.players[young.id]);
  });

  it('develops a week at a time in small steps, and a camp for every player on a team and in free agency', () => {
    const league = fresh();
    league.date = { season: 2026, phase: 'regularSeason', week: 2 };
    const week = weeklyDevelopment(league, {}, stream(1, 'week'));
    expect(week.length).toBeGreaterThan(0);
    expect(week.every(c => c.cause === 'weekly' && Object.values(c.deltas).every(d => Math.abs(d) <= 3))).toBe(true);
    const again = structuredClone(fresh());
    again.date = { season: 2026, phase: 'regularSeason', week: 2 };
    expect(weeklyDevelopment(again, {}, stream(1, 'week'))).toEqual(week);
    league.date = { ...camp };
    const changes = campDevelopment(league, stream(2, 'camp'));
    const moved = new Set(changes.map(c => c.playerId));
    const free = Object.values(league.players).filter(p => p.status === 'freeAgent');
    expect(changes.every(c => c.cause === 'camp')).toBe(true);
    expect(free.some(p => moved.has(p.id))).toBe(true);
  }); // prettier-ignore
});
