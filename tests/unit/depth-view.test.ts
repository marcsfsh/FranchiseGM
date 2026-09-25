import { describe, expect, it } from 'vitest';
import { startersOf } from '../../src/engine/league/depth';
import { depthRows, moveInDepth } from '../../src/engine/league/depth-view';
import type { League } from '../../src/engine/league/types';
import { situationLeague } from '../helpers/situations';

const fresh = (): League => structuredClone(situationLeague);
const TEAM = 'KC' as const;

describe('the depth chart view (spec 12.2, style guide 7.4)', () => {
  it("lists every eligible active player at each slot, the sim's starter first", () => {
    const league = fresh();
    const rows = depthRows(league, TEAM);
    expect(rows.QB.length).toBeGreaterThanOrEqual(2);
    expect(rows.QB.every(r => league.players[r.id]?.position === 'QB')).toBe(true);
    expect(new Set(rows.X.map(r => r.id)).size).toBe(rows.X.length);
    // No two offensive slots show the same available starter.
    const offense = ['QB', 'RB1', 'X', 'Z', 'SLOT', 'TE1', 'LT', 'LG', 'C', 'RG', 'RT'] as const;
    const tops = offense.map(s => rows[s].find(r => r.available)?.id);
    expect(new Set(tops).size).toBe(tops.length);
  });

  it('moves a player and keeps him from starting at two slots of a unit', () => {
    const league = fresh();
    const rows = depthRows(league, TEAM);
    const xStarter = rows.X[0]?.id as string;
    // Pin him at X, then make him the slot receiver's starter too.
    league.teams[TEAM].depth.order = { X: [xStarter] };
    const move = moveInDepth(league, TEAM, 'SLOT', xStarter, 0);
    expect(move.order.SLOT?.[0]).toBe(xStarter);
    expect(move.starter).toBe(xStarter);
    expect(move.order.X).not.toContain(xStarter);
    expect(move.notes.some(n => /now starts at x receiver in place of /.test(n))).toBe(true);
    // Special teams don't conflict: a starter can also return kicks.
    const returner = moveInDepth(league, TEAM, 'KR', xStarter, 0);
    expect(returner.notes).toEqual([]);
    expect(startersOf(returner.order).KR).toBe(xStarter);
  });

  it('names the slot the lineup refills when nothing was pinned there', () => {
    const league = fresh();
    const rows = depthRows(league, TEAM);
    const xStarter = rows.X[0]?.id as string;
    const move = moveInDepth(league, TEAM, 'SLOT', xStarter, 0);
    const name = (id: string) => `${league.players[id]?.firstName} ${league.players[id]?.lastName}`;
    expect(move.notes.find(n => n.includes('x receiver'))).toMatch(
      new RegExp(`now starts at x receiver in place of ${name(xStarter)}\\.$`)
    );
  });

  it('moves a backup down the list without touching the starter', () => {
    const league = fresh();
    const rows = depthRows(league, TEAM).CB1;
    const [first, second, third] = [0, 1, 2].map(i => rows[i]?.id ?? '') as [string, string, string];
    const move = moveInDepth(league, TEAM, 'CB1', second, 2);
    expect(move.order.CB1?.slice(0, 3)).toEqual([first, third, second]);
    expect(move.notes).toEqual([]);
  });
});
