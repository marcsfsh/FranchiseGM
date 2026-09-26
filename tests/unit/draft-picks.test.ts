import { describe, expect, it } from 'vitest';
import { TEAM_ABBRS } from '../../src/data/team-colors';
import { latestDraftOrder, numberDraft, picksIn } from '../../src/engine/draft/picks';
import { draftOrder, rookieReserve, standInDraft } from '../../src/engine/generate/rookies';
import type { League } from '../../src/engine/league/types';
import type { GameDate, Phase } from '../../src/engine/model/calendar';
import { stream } from '../../src/engine/rng';
import { waiverOrder } from '../../src/engine/roster/waivers';
import { closeSeason } from '../../src/engine/season/offseason';
import { nameData } from '../helpers/base-data';
import { situationLeague } from '../helpers/situations';

// Draft picks (spec 10.4; D-42): records for three drafts, numbered by the finish, compensatory picks after
// their rounds, the waiver order, and the draft taking each pick for the team that holds it.
const at = (season: number, phase: Phase, week = 1): GameDate => ({ season, phase, week });
const fresh = (date: GameDate): League => Object.assign(structuredClone(situationLeague), { date });

describe('draft picks (spec 10.4)', () => {
  it('holds seven rounds for every team in each of the next three drafts', () => {
    const league = fresh(at(2026, 'regularSeason'));
    expect(league.picks).toHaveLength(3 * 7 * 32);
    expect(new Set(league.picks.map(p => p.year))).toEqual(new Set([2027, 2028, 2029]));
    expect(league.picks.every(p => p.owner === p.original && p.number === null && !p.compensatory)).toBe(
      true
    );
  });

  it('numbers a draft by the finish, with compensatory picks after their round', () => {
    const league = fresh(at(2026, 'superBowl'));
    league.picks.push({ id: '2027-3-MIN-c1', year: 2027, round: 3, original: 'MIN', owner: 'MIN', compensatory: true, number: null, playerId: null }); // prettier-ignore
    const order = [...TEAM_ABBRS].reverse();
    numberDraft(league, 2027, order);
    const draft = picksIn(league, 2027);
    expect(draft.slice(0, 32).map(p => p.original)).toEqual(order);
    expect(draft.map(p => p.number)).toEqual(draft.map((_, i) => i + 1));
    expect(draft.find(p => p.compensatory)?.number).toBe(97);
    expect(draft.find(p => p.round === 4)?.number).toBe(98);
  });

  it("sets the next draft's order when the season ends, and the waiver order follows it", () => {
    const league = fresh(at(2026, 'superBowl'));
    // Before any draft is ordered, a seeded order stands in for the waiver order (D-22).
    expect(latestDraftOrder(league)).toBeNull();
    const seeded = waiverOrder(league, stream(1, 'waivers'));
    closeSeason(league);
    const order = draftOrder(league);
    expect(latestDraftOrder(league)).toEqual(order);
    expect(
      picksIn(league, 2027)
        .slice(0, 32)
        .map(p => p.original)
    ).toEqual(order);
    expect(picksIn(league, 2028).every(p => p.number === null)).toBe(true);
    league.date = at(2026, 'freeAgency');
    expect(waiverOrder(league, stream(1, 'waivers'))).toEqual(order);
    expect(seeded).toHaveLength(32);
  });

  it('drafts with each pick for the team that holds it, then issues the picks three drafts on', () => {
    const league = fresh(at(2026, 'superBowl'));
    closeSeason(league);
    league.date = at(2026, 'draft');
    // Kansas City holds Minnesota's first-rounder and reserves room for it.
    const traded = picksIn(league, 2027).find(p => p.round === 1 && p.original === 'MIN');
    if (!traded) throw new Error('no pick');
    const before = rookieReserve(league, 'KC');
    traded.owner = 'KC';
    expect(rookieReserve(league, 'KC')).toBeGreaterThan(before);
    const picks = standInDraft(league, nameData(), stream(2, 'draft'));
    expect(picks).toHaveLength(7 * 32);
    const made = picks.find(p => p.pick === traded.number);
    expect(made?.team).toBe('KC');
    expect(league.players[made?.playerId ?? '']).toMatchObject({ team: 'KC', draft: { year: 2027, round: 1, pick: traded.number, team: 'KC' } }); // prettier-ignore
    expect(traded.playerId).toBe(made?.playerId);
    expect(league.picks.filter(p => p.year === 2030)).toHaveLength(7 * 32);
  });
});
