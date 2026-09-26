import { describe, expect, it } from 'vitest';
import { TEAM_ABBRS } from '../../src/data/team-colors';
import { draftValue, type Prospect } from '../../src/engine/draft/class';
import {
  errorScale,
  gradeWith,
  NATIONAL,
  revealed,
  scoutWeek,
  spendOn,
  teamGrades
} from '../../src/engine/draft/scouting';
import { teamStaff } from '../../src/engine/league/fit';
import type { League } from '../../src/engine/league/types';
import { TUNING } from '../../src/engine/tuning';
import { situationLeague } from '../helpers/situations';

// Scouting (spec 10.4; D-43): grades, what scouting points do, the director and the setting, the weekly
// points, and what auto scouting spends.
const S = TUNING.draft.scouting;
const fresh = (): League => structuredClone(situationLeague);
const classOf = (league: League) => {
  if (!league.draft) throw new Error('no class');
  return league.draft;
};

describe('scouting grades (spec 10.4)', () => {
  it("starts from the consensus view plus the team's own error, and scouting narrows both", () => {
    const league = fresh();
    const draft = classOf(league);
    const p = draft.prospects[0] as Prospect;
    const scale = errorScale(league, 'MIN');
    const z = (p.noise[TEAM_ABBRS.indexOf('MIN')] ?? 0) / 100;
    const cold = gradeWith(draft, 'MIN', p, scale);
    expect(cold.scouted).toBe(0);
    expect(cold.spread).toBeCloseTo(S.teamSd * scale, 10);
    expect(cold.value).toBeCloseTo(draftValue(p.player) + p.perception + z * S.teamSd * scale, 10);
    // A full workup: the team's error cut by pointsCut, and half the consensus misjudgment seen through.
    draft.scouting.MIN.points[p.player.id] = S.fullPoints;
    const full = gradeWith(draft, 'MIN', p, scale);
    expect(full.spread).toBeCloseTo(S.teamSd * scale * (1 - S.pointsCut), 10);
    expect(full.value).toBeCloseTo(
      draftValue(p.player) + p.perception * (1 - S.consensusCut) + z * full.spread,
      10
    );
    expect(revealed(draft, 'MIN', p.player.id)).toEqual({
      traits: true,
      abilities: true,
      personality: false
    });
  });

  it('grows with a sharp director of scouting and the accuracy setting', () => {
    const league = fresh();
    const director = teamStaff(league, 'MIN').find(s => s.role === 'DOS');
    if (!director) throw new Error('no director');
    director.ratings.accuracy = 99;
    const sharp = errorScale(league, 'MIN');
    director.ratings.accuracy = 1;
    expect(errorScale(league, 'MIN')).toBeGreaterThan(sharp);
    director.ratings.accuracy = 50;
    league.settings.draft.scoutingAccuracy = 2;
    expect(errorScale(league, 'MIN')).toBeCloseTo(0.5, 10);
  });
});

describe('a week of scouting (spec 10.4)', () => {
  it('banks points by region and spends them, never past a full workup', () => {
    const league = fresh();
    const draft = classOf(league);
    const p = draft.prospects.find(x => x.region) as Prospect;
    draft.scouting.MIN.bank = { [p.region as string]: 20, [NATIONAL]: 100 };
    expect(spendOn(draft, 'MIN', p, 30)).toBe(30);
    expect(draft.scouting.MIN.bank).toEqual({ [p.region as string]: 0, [NATIONAL]: 90 });
    expect(spendOn(draft, 'MIN', p, 100)).toBe(S.fullPoints - 30);
    expect(draft.scouting.MIN.points[p.player.id]).toBe(S.fullPoints);
  });

  it("places and pays every team's scouts, and spends for the teams on auto", () => {
    const league = fresh();
    league.settings.auto.scouting = false;
    const draft = classOf(league);
    scoutWeek(league);
    // The user's team, scouting by hand, banks its points; every AI team spent its own.
    const mine = draft.scouting[league.meta.start.userTeam];
    expect(Object.values(mine.bank).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    expect(Object.keys(mine.points)).toHaveLength(0);
    const theirs = draft.scouting.KC;
    expect(Object.keys(theirs.points).length).toBeGreaterThan(0);
    expect(
      teamStaff(league, 'KC')
        .filter(s => s.role === 'SCOUT')
        .every(s => s.region)
    ).toBe(true);
    // Auto spends on the prospects the team grades highest.
    const grades = teamGrades(league, draft, 'KC');
    const best = [...grades].sort((a, b) => b[1].value - a[1].value)[0]?.[0] ?? '';
    expect(theirs.points[best] ?? 0).toBeGreaterThan(0);
  });
});
