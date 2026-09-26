import { describe, expect, it } from 'vitest';
import { draftValue, generateClass, generateProspect, perceivedValue } from '../../src/engine/draft/class';
import { ACTIVE_ROSTER } from '../../src/engine/generate/league';
import { newId } from '../../src/engine/league/transactions';
import type { League } from '../../src/engine/league/types';
import { fullName } from '../../src/engine/model/player';
import { POSITION_GROUP } from '../../src/engine/model/positions';
import { stream } from '../../src/engine/rng';
import { TUNING } from '../../src/engine/tuning';
import { nameData } from '../helpers/base-data';
import { situationLeague } from '../helpers/situations';

// Draft classes (spec 10.3, 22.4; D-41): size, position mix, strength draws, busts and gems, and names.
const D = TUNING.draft;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const make = (change: (league: League) => void = () => {}, seed = 1) => {
  const league = structuredClone(situationLeague);
  change(league);
  const rng = stream(seed, 'class');
  return { league, made: generateClass(league, 2027, { names: nameData(), rng, newId: () => newId(league, 'p') }, rng) };
}; // prettier-ignore

describe('draft classes (spec 10.3)', () => {
  it('comes with the league, and holds the set number of prospects in a roster-like mix', () => {
    expect(situationLeague.draft?.year).toBe(2027);
    expect(situationLeague.draft?.prospects).toHaveLength(D.classSize);
    const { made } = make(l => (l.settings.draft.classSize = 300));
    expect(made.prospects).toHaveLength(300);
    // Each position's share is near a standard roster's: cornerbacks 6 of 53, quarterbacks 2 of 53.
    const all = [1, 2, 3].flatMap(seed => make(() => {}, seed).made.prospects);
    const share = (pos: string) => all.filter(p => p.player.position === pos).length / all.length;
    const total = ACTIVE_ROSTER.reduce((a, [, n]) => a + n, 0);
    expect(share('CB')).toBeCloseTo(6 / total, 1);
    expect(share('QB')).toBeCloseTo(2 / total, 1);
    // A position set to none has none.
    const noKickers = make(l => (l.settings.draft.positionMix.K = 0)).made;
    expect(noKickers.prospects.some(p => p.player.position === 'K')).toBe(false);
  });

  it('draws a strength for the class and for each position group', () => {
    const base = make().made;
    const strong = make(l => (l.settings.draft.strengthMean = 1)).made;
    expect(strong.strength.overall - base.strength.overall).toBeCloseTo(D.strengthMax, 5);
    const ovr = (c: typeof base, group?: string) =>
      mean(c.prospects.filter(p => !group || POSITION_GROUP[p.player.position] === group).map(p => p.player.ovr));
    expect(ovr(strong)).toBeGreaterThan(ovr(base));
    const deepQbs = make(l => (l.settings.draft.groupMean.QB = 1)).made;
    expect(deepQbs.strength.groups.QB - base.strength.groups.QB).toBeCloseTo(D.strengthMax, 5);
    // No spread, no draw: every class at its mean.
    const flat = make(l => Object.assign(l.settings.draft, { strengthSpread: 0 })).made;
    expect(flat.strength.overall).toBe(0);
  }); // prettier-ignore

  it('misjudges prospects, with busts overrated and gems underrated as the settings say', () => {
    const value = (c: ReturnType<typeof make>['made']) => mean(c.prospects.map(p => p.perception));
    const none = make(l => Object.assign(l.settings.draft, { bust: zero(l), gem: zero(l) })).made;
    // With neither, every misjudgment is small: none past four standard deviations.
    expect(none.prospects.every(p => Math.abs(p.perception) < 4 * D.perceptionSd)).toBe(true);
    const busts = make(l => Object.assign(l.settings.draft, { bust: twice(l), gem: zero(l) })).made;
    const gems = make(l => Object.assign(l.settings.draft, { bust: zero(l), gem: twice(l) })).made;
    expect(value(busts)).toBeGreaterThan(value(none) + 1);
    expect(value(gems)).toBeLessThan(value(none) - 1);
    const p = busts.prospects[0];
    if (p) expect(perceivedValue(p)).toBeCloseTo(draftValue(p.player) + p.perception, 5);
  });

  it('gives every prospect a new name, and can make one years before his class', () => {
    const { league, made } = make();
    const names = made.prospects.map(p => fullName(p.player));
    expect(new Set(names).size).toBe(names.length);
    const taken = new Set(Object.values(league.players).map(fullName));
    expect(names.some(n => taken.has(n))).toBe(false);
    // A prospect for the 2031 class, made in 2026: 21 as the 2031 season starts, no seasons yet.
    const rng = stream(9, 'early');
    const early = generateProspect(
      { names: nameData(), rng, season: 2026, usedNames: new Set(), newId: () => 'x1' },
      { position: 'WR', quality: 0, age: 21, classYear: 2031 }
    );
    expect(Number(early.birthDate.slice(0, 4))).toBeGreaterThanOrEqual(2009);
    expect(early).toMatchObject({
      experience: 0,
      accrued: 0,
      team: null,
      draft: { year: 2031, undrafted: true }
    });
  });
});

function zero(league: League) {
  return Object.fromEntries(
    Object.keys(league.settings.draft.bust).map(g => [g, 0])
  ) as League['settings']['draft']['bust'];
}
function twice(league: League) {
  return Object.fromEntries(Object.keys(league.settings.draft.bust).map(g => [g, 2])) as League['settings']['draft']['bust'];
} // prettier-ignore
