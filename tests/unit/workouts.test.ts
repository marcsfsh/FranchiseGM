import { describe, expect, it } from 'vitest';
import { perceivedValue } from '../../src/engine/draft/class';
import { autoVisits, measure, visit, workOut } from '../../src/engine/draft/workouts';
import type { League } from '../../src/engine/league/types';
import type { Ratings } from '../../src/engine/model/ratings';
import { stream } from '../../src/engine/rng';
import { advanceOffseason } from '../../src/engine/season/offseason';
import { TUNING } from '../../src/engine/tuning';
import { nameData } from '../helpers/base-data';
import { situationLeague } from '../helpers/situations';

// The combine, pro days, and top-30 visits (spec 10.4; D-44).
const W = TUNING.draft.workout;
const fresh = (): League => structuredClone(situationLeague);
const classOf = (league: League) => {
  if (!league.draft) throw new Error('no class');
  return league.draft;
};
const athlete = (level: number): Ratings =>
  ({ spd: level, acc: level, agi: level, cod: level, str: level, jmp: level }) as Ratings;

describe('workouts (spec 10.4)', () => {
  it('draws drill results from the ratings they test', () => {
    const mean = (f: (r: Ratings) => number, level: number) =>
      Array.from({ length: 200 }, (_, i) => f(measure(athlete(level), stream(i, 'drill')) as never)).reduce((a, b) => a + b, 0) / 200; // prettier-ignore
    // A typical receiver's speed runs about 4.45, a lineman's about 5.25.
    expect(mean(m => (m as unknown as { forty: number }).forty, 88)).toBeCloseTo(4.45, 1);
    expect(mean(m => (m as unknown as { forty: number }).forty, 52)).toBeCloseTo(5.25, 1);
    const strong = measure(athlete(95), stream(1, 'drill'));
    const weak = measure(athlete(50), stream(1, 'drill'));
    expect(strong.bench).toBeGreaterThan(weak.bench);
    expect(strong.vertical).toBeGreaterThan(weak.vertical);
    expect(strong.cone).toBeLessThan(weak.cone);
    expect(strong.shuttle).toBeLessThan(weak.shuttle);
  });

  it('works out the combine invitees and then the pro days, narrowing the consensus misjudgment', () => {
    const draft = classOf(fresh());
    const before = new Map(draft.prospects.map(p => [p.player.id, p.perception]));
    const top = [...draft.prospects].filter(p => !['K', 'P', 'LS'].includes(p.player.position)).sort((a, b) => perceivedValue(b) - perceivedValue(a))[0]; // prettier-ignore
    const news = workOut(draft, 'combine', stream(3, 'combine'));
    const combine = draft.prospects.filter(p => p.workout === 'combine');
    expect(combine).toHaveLength(W.invites);
    expect(top?.workout).toBe('combine');
    for (const p of combine) {
      expect(p.measurables).not.toBeNull();
      expect(Math.abs(p.perception)).toBeLessThanOrEqual(Math.abs(before.get(p.player.id) ?? 0));
    }
    // Risers were underrated, fallers overrated; specialists don't run the drills.
    expect(news.risers.every(p => (before.get(p.player.id) ?? 0) < 0)).toBe(true);
    expect(news.fallers.every(p => (before.get(p.player.id) ?? 0) > 0)).toBe(true);
    expect(combine.some(p => ['K', 'P', 'LS'].includes(p.player.position))).toBe(false);
    // Pro days take the next ones, up to their limit: here everyone left.
    const left = draft.prospects.filter(
      p => !p.workout && !['K', 'P', 'LS'].includes(p.player.position)
    ).length;
    workOut(draft, 'proDay', stream(3, 'pro'));
    expect(draft.prospects.filter(p => p.workout === 'proDay')).toHaveLength(Math.min(W.proDays, left));
  });

  it('lets a team make up to 30 visits after the combine, and fills them on auto', () => {
    const league = fresh();
    const draft = classOf(league);
    const id = draft.prospects[0]?.player.id ?? '';
    expect(visit(league, 'MIN', id)).toBe('Visits open after the combine.');
    workOut(draft, 'combine', stream(3, 'combine'));
    expect(visit(league, 'MIN', id)).toBeNull();
    expect(visit(league, 'MIN', id)).toBe('You already brought him in.');
    autoVisits(league, draft, 'KC');
    expect(draft.scouting.KC.visits).toHaveLength(league.rules.season.draftVisits);
    expect(new Set(draft.scouting.KC.visits).size).toBe(league.rules.season.draftVisits);
  });

  it('reports the combine in the news as the offseason reaches it', () => {
    const league = fresh();
    league.date = { season: 2026, phase: 'resign', week: 1 };
    const step = advanceOffseason(league, { names: nameData() }, { actions: 0, entropy: 1 });
    expect(league.date.phase).toBe('combine');
    expect(step.news.some(n => n.kind === 'draft' && n.headline.includes('at the combine'))).toBe(true);
  });
});
