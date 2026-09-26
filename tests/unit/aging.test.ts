import { describe, expect, it } from 'vitest';
import {
  computeAging,
  peakAge,
  type AgingFacts,
  type ChainPlayer,
  type ChainSnapshot
} from '../../src/engine/calibration/chain';
import type { PositionGroup } from '../../src/engine/model/positions';

// The aging metrics (spec 23.3) from leagues chained through the offseason, on made-up chains.
const player = (id: string, group: PositionGroup, age: number, ovr: number, change: Partial<ChainPlayer> = {}): ChainPlayer => ({
  id, group, age, exactAge: age + 0.5, ovr, experience: Math.max(0, age - 22), accrued: Math.max(0, age - 22), active: true, ...change
}); // prettier-ignore
const snap = (season: number, players: ChainPlayer[], teams = 2): ChainSnapshot => ({
  season,
  teams,
  players
});

/** A chain of two seasons where each running back's overall changes by `change(age)` from one to the next. */
function curveChain(change: (age: number) => number, perAge = 30): AgingFacts {
  const first: ChainPlayer[] = [];
  const second: ChainPlayer[] = [];
  for (let age = 21; age <= 36; age++)
    for (let i = 0; i < perAge; i++) {
      const id = `rb-${age}-${i}`;
      first.push(player(id, 'RB', age, 70));
      second.push(player(id, 'RB', age + 1, 70 + change(age)));
    }
  return { snapshots: [snap(2026, first), snap(2027, second)], retirements: [] };
}

describe('aging curves (spec 23.3)', () => {
  it('finds the peak where the mean change turns from rising to falling, at the next camp', () => {
    // Up 5 a year at 21, down a point a year each age after: level at 26, so the peak is a camp later.
    const peak = peakAge([curveChain(age => 26 - age)], 'RB');
    expect(peak.value).toBeCloseTo(26.75, 5);
    expect(peak.n).toBe(16 * 30);
    // A curve that never turns has no peak, and a group with nobody has none either.
    expect(peakAge([curveChain(() => 1)], 'RB').value).toBeNull();
    expect(peakAge([curveChain(age => 26 - age)], 'QB').value).toBeNull();
    // Ages with too few players don't count.
    expect(peakAge([curveChain(age => 26 - age, 5)], 'RB').value).toBeNull();
  });

  it('measures the rosters, their drift, and retirements', () => {
    const first = snap(2026, [
      player('a', 'QB', 22, 60, { experience: 1, accrued: 0 }),
      player('b', 'QB', 31, 80),
      player('c', 'WR', 25, 70),
      player('d', 'WR', 30, 74, { active: false })
    ]);
    const last = snap(2027, [
      player('a', 'QB', 23, 64),
      player('b', 'QB', 32, 78),
      player('c', 'WR', 26, 72)
    ]);
    const aging = computeAging([
      { snapshots: [first, last], retirements: [{ group: 'WR', age: 30.5, experience: 8 }] }
    ]);
    // Active players only: 3 then 3, on 2 teams a season.
    expect(aging.get('aging.meanAge')?.value).toBeCloseTo((22.5 + 31.5 + 25.5 + 23.5 + 32.5 + 26.5) / 6, 5);
    expect(aging.get('aging.rookiesPerTeam')?.value).toBeCloseTo(1 / 4, 5);
    expect(aging.get('aging.over30PerTeam')?.value).toBeCloseTo(2 / 4, 5);
    // League average 70 to 71.33; QBs 70 to 71, receivers 70 to 72.
    expect(aging.get('aging.ovrDrift')?.value).toBeCloseTo(214 / 3 - 70, 5);
    expect(aging.get('aging.groupDrift')?.value).toBeCloseTo(2, 5);
    expect(aging.get('aging.retireAge')).toEqual({ value: 30.5, n: 1 });
    // One season can't show a drift.
    expect(computeAging([{ snapshots: [first], retirements: [] }]).get('aging.ovrDrift')?.value).toBeNull();
  });
});
