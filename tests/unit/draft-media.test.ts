import { describe, expect, it } from 'vitest';
import { TEAM_ABBRS } from '../../src/data/team-colors';
import {
  draftMediaWeek,
  firstRoundOrder,
  mediaBoard,
  mediaValue,
  mockDraft
} from '../../src/engine/draft/media';
import { draftWorth, need } from '../../src/engine/draft/needs';
import { numberDraft, picksIn } from '../../src/engine/draft/picks';
import type { League } from '../../src/engine/league/types';
import { stream } from '../../src/engine/rng';
import { TUNING } from '../../src/engine/tuning';
import { situationLeague } from '../helpers/situations';

// The draft's media and the AI's need-and-value model (spec 10.4; D-45).
const M = TUNING.draft.media;
const N = TUNING.draft.needs;
const fresh = (): League => structuredClone(situationLeague);
const classOf = (league: League) => {
  if (!league.draft) throw new Error('no class');
  return league.draft;
};
const order = [...TEAM_ABBRS];

describe('needs (spec 10.4)', () => {
  it('grows as the starters fall short, and when the position is thin', () => {
    const league = fresh();
    const qbs = Object.values(league.players).filter(p => p.team === 'MIN' && p.position === 'QB');
    for (const p of qbs) p.ovr = 95;
    expect(need(league, 'MIN', 'QB')).toBeLessThanOrEqual(N.shortBonus);
    for (const p of qbs) Object.assign(p, { team: null, status: 'freeAgent' });
    expect(need(league, 'MIN', 'QB')).toBe(1);
    expect(draftWorth(70, 1)).toBe(70 + N.weight);
  });
});

describe('the media and mock drafts (spec 10.4)', () => {
  it("ranks the media's board by the consensus view and hype", () => {
    const draft = classOf(fresh());
    const board = mediaBoard(draft, 50);
    expect(board).toHaveLength(50);
    for (let i = 1; i < board.length; i++) expect(mediaValue(board[i - 1] as never)).toBeGreaterThanOrEqual(mediaValue(board[i] as never)); // prettier-ignore
  });

  it('mocks the first round with each team taking the prospect worth most to it', () => {
    const league = fresh();
    const picks = mockDraft(league, classOf(league), order);
    expect(picks).toHaveLength(32);
    expect(picks.map(p => p.team)).toEqual(order);
    expect(new Set(picks.map(p => p.prospectId)).size).toBe(32);
  });

  it("orders the first round by the finish so far, with each pick's holder, and then by its numbers", () => {
    const league = fresh();
    const pick = picksIn(league, 2027).find(p => p.round === 1 && p.original === 'MIN');
    if (!pick) throw new Error('no pick');
    pick.owner = 'KC';
    const finish = [...order].reverse();
    const before = firstRoundOrder(league, 2027, finish);
    expect(before[finish.indexOf('MIN')]).toBe('KC');
    numberDraft(league, 2027, order);
    expect(firstRoundOrder(league, 2027, finish)[order.indexOf('MIN')]).toBe('KC');
  });

  it('makes hype headlines from its week, and publishes mocks from midseason', () => {
    const league = fresh();
    const draft = classOf(league);
    expect(draftMediaWeek(league, 1, M.hypeFrom - 1, order, stream(1, 'm'))).toEqual([]);
    const hype = draftMediaWeek(league, M.hypeFrom, M.hypeFrom, order, stream(2, 'm'));
    expect(hype).toHaveLength(M.hypePerWeek);
    expect(hype[0]?.headline).toMatch(/^Draft stock: /);
    expect(draft.prospects.some(p => p.hype !== 0)).toBe(true);
    expect(draft.mock).toBeNull();
    const first = draftMediaWeek(league, M.mocksFrom, M.mocksFrom, order, stream(3, 'm'));
    expect(draft.mock?.picks).toHaveLength(32);
    expect(first.some(h => h.headline.startsWith('Mock draft: '))).toBe(true);
  });
});
