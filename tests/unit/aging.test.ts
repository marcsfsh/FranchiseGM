import { describe, expect, it } from 'vitest';
import {
  computeAging,
  draftHits,
  peakAge,
  snapshot,
  type AgingFacts,
  type ChainPlayer,
  type ChainSnapshot
} from '../../src/engine/calibration/chain';
import type { PositionGroup } from '../../src/engine/model/positions';
import { situationLeague } from '../helpers/situations';

// The aging metrics (spec 23.3) from leagues chained through the offseason, on made-up chains.
const player = (id: string, group: PositionGroup, age: number, ovr: number, change: Partial<ChainPlayer> = {}): ChainPlayer => ({
  id, group, age, exactAge: age + 0.5, ovr, experience: Math.max(0, age - 22), accrued: Math.max(0, age - 22), active: true, draft: null, starter: false, ...change
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

describe('draft hit rates (spec 23.3; D-50)', () => {
  it("counts each round's picks who started 4 or more of the seasons followed", () => {
    // A 12-season chain from 2026 to 2037: picks from the 2027 to 2030 drafts are followed 8 seasons.
    const seasons = Array.from({ length: 12 }, (_, i) => 2026 + i);
    const pick = (id: string, year: number, round: number, startsFrom: number | null) => (season: number) =>
      season < year
        ? []
        : [
            player(id, 'WR', 22 + season - year, 70, {
              draft: { year, round },
              starter: startsFrom !== null && season >= startsFrom && season < startsFrom + 4
            })
          ];
    const picks = [
      pick('hit', 2027, 1, 2028), // four seasons as a starter: a hit
      pick('short', 2027, 1, 2034), // starts from his eighth season: 1 in the eight followed, a miss
      pick('late', 2031, 2, 2031), // a 2031 pick is followed through 2038, past the chain: not counted
      pick('old', 2026, 1, 2026) // drafted before the chain began: not counted
    ]; // prettier-ignore
    const facts: AgingFacts = {
      snapshots: seasons.map(season =>
        snap(
          season,
          picks.flatMap(p => p(season))
        )
      ),
      retirements: []
    };
    const hits = draftHits([facts]);
    expect(hits.get('draft.starterRate.R1')).toEqual({ value: 0.5, n: 2 });
    expect(hits.get('draft.starterRate.R2')).toEqual({ value: null, n: 0 });
    expect(computeAging([facts]).get('draft.starterRate.R1')?.value).toBe(0.5);
  });

  it('counts the quarterbacks each draft took in its first round, and leaves specialists out', () => {
    const qbs = (year: number, n: number) =>
      Array.from({ length: n }, (_, i) =>
        player(`qb-${year}-${i}`, 'QB', 22, 70, { draft: { year, round: 1 } })
      );
    const kicker = player('k', 'ST', 22, 70, { draft: { year: 2027, round: 1 }, starter: true });
    const facts: AgingFacts = {
      snapshots: [snap(2026, []), snap(2027, [...qbs(2027, 2), kicker]), snap(2028, [...qbs(2027, 2), ...qbs(2028, 4)]), snap(2029, [])],
      retirements: []
    }; // prettier-ignore
    const hits = draftHits([facts]);
    // Three drafts (2027 to 2029) took 6 quarterbacks in their first rounds, each counted once.
    expect(hits.get('draft.qbsFirstRound')).toEqual({ value: 2, n: 3 });
    expect(hits.get('draft.starterRate.R1')?.n).toBe(0);
  });

  it("reads each team's starters from its depth chart, skipping players off its active roster", () => {
    // A chart set at camp, whose first quarterback was cut since.
    const league = structuredClone(situationLeague);
    const [cut, backup] = Object.values(league.players).filter(p => p.team === 'MIN' && p.position === 'QB');
    if (!cut || !backup) throw new Error('no quarterbacks');
    league.teams.MIN.depth.order.QB = [cut.id, backup.id];
    Object.assign(cut, { team: null, status: 'freeAgent' });
    const players = new Map(snapshot(league).players.map(p => [p.id, p]));
    expect(players.get(cut.id)?.starter).toBe(false);
    expect(players.get(backup.id)?.starter).toBe(true);
  });
});
