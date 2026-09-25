import { describe, expect, it } from 'vitest';
import type { TeamAbbr } from '../../src/data/team-colors';
import { emptyTotals } from '../../src/engine/sim/stats';
import {
  careerTotalsOf,
  leaderboard,
  rateMinimum,
  seasonTotals,
  teamSeasonStats,
  type PlayerTotals
} from '../../src/engine/stats/leaders';
import type { GameRecord } from '../../src/engine/stats/record';
import { appendRows, emptyTable, type StatRow } from '../../src/engine/stats/table';

const row = (
  playerId: string,
  gameId: string,
  team: TeamAbbr,
  values: Record<string, number>,
  kind: StatRow['kind'] = 'regular'
): StatRow => ({ playerId, gameId, team, kind, values });

const player = (playerId: string, totals: PlayerTotals['totals'], team: TeamAbbr = 'MIN'): PlayerTotals => ({
  playerId,
  team,
  games: 17,
  totals
});

describe('leaderboards (spec 19.3)', () => {
  it("sums a season's regular-season rows by player, with games played and his latest team", () => {
    const rushing = appendRows(emptyTable(2026, 'rushing', ['rushAtt', 'rushYds', 'rushLong']), [
      row('p1', 'g1', 'MIN', { rushAtt: 20, rushYds: 90, rushLong: 31 }),
      row('p1', 'g2', 'MIN', { rushAtt: 15, rushYds: 60, rushLong: 12 }),
      row('p1', 'g0', 'MIN', { rushAtt: 30, rushYds: 200, rushLong: 80 }, 'preseason'),
      row('p1', 'g3', 'GB', { rushAtt: 10, rushYds: 40, rushLong: 9 }),
      row('p1', 'g9', 'GB', { rushAtt: 25, rushYds: 150, rushLong: 50 }, 'playoffs')
    ]);
    const receiving = appendRows(emptyTable(2026, 'receiving', ['receptions']), [
      row('p1', 'g2', 'MIN', { receptions: 3 }),
      row('p2', 'g1', 'MIN', { receptions: 5 })
    ]);
    const totals = seasonTotals({ rushing, receiving });
    expect(totals).toEqual([
      { playerId: 'p1', team: 'GB', games: 3, totals: { rushAtt: 45, rushYds: 190, rushLong: 31, receptions: 3 } },
      { playerId: 'p2', team: 'MIN', games: 1, totals: { receptions: 5 } }
    ]);
  }); // prettier-ignore

  it('ranks by a stat, best first, and leaves out players without it or outside the filters', () => {
    const players = [
      player('a', { passYds: 4000, passAtt: 500, passCmp: 330 }),
      player('b', { passYds: 4500, passAtt: 560, passCmp: 350 }, 'GB'),
      player('c', { passYds: 4000, passAtt: 100, passCmp: 90 }),
      player('d', { rushYds: 900 })
    ];
    expect(leaderboard(players, 'passYds', { limit: 10 }).map(e => [e.playerId, e.value])).toEqual([
      ['b', 4500],
      ['a', 4000],
      ['c', 4000]
    ]);
    expect(leaderboard(players, 'passYds', { limit: 10, keep: p => p.team === 'MIN' }).map(e => e.playerId)).toEqual(['a', 'c']);
    expect(leaderboard(players, 'passYds', { limit: 1 })).toHaveLength(1);
    // A rate needs its minimum: 14 attempts per team game, 238 for a full season.
    const minimum = rateMinimum('completionPct', 'season', 17);
    expect(minimum).toBe(238);
    const rates = leaderboard(players, 'completionPct', { limit: 10, minimum });
    expect(rates.map(e => e.playerId)).toEqual(['a', 'b']);
    expect(rates[0]?.value).toBeCloseTo(66, 5);
    expect(rateMinimum('passerRating', 'career', 17)).toBe(1500);
    expect(rateMinimum('yardsPerCarry', 'season', 9)).toBe(Math.ceil(6.25 * 9));
  }); // prettier-ignore

  it('totals careers by player, with his last team', () => {
    const careers = careerTotalsOf([
      {
        id: 'p1',
        seasons: [
          { season: 2025, team: 'MIN', kind: 'regular', games: 17, starts: 17, totals: { sacks: 10 } },
          { season: 2026, team: 'GB', kind: 'regular', games: 16, starts: 16, totals: { sacks: 12 } },
          { season: 2026, team: 'GB', kind: 'playoffs', games: 2, starts: 2, totals: { sacks: 3 } }
        ]
      },
      { id: 'p2', seasons: [] }
    ]);
    expect(careers).toEqual([{ playerId: 'p1', team: 'GB', games: 33, totals: { sacks: 22 } }]);
  });
});

describe('team season stats (spec 9.2)', () => {
  it("sums each club's regular-season games for its offense and its opponents' for its defense", () => {
    const totals = (points: number, totalYards: number) => ({ ...emptyTotals(), points, totalYards });
    const game = (id: string, home: TeamAbbr, away: TeamAbbr, score: [number, number], kind: GameRecord['kind'] = 'regular') =>
      ({ id, home, away, kind, score: { home: score[0], away: score[1] }, totals: { home: totals(score[0], 350), away: totals(score[1], 280) } }) as unknown as GameRecord; // prettier-ignore
    const stats = teamSeasonStats([
      game('g1', 'MIN', 'GB', [24, 17]),
      game('g2', 'CHI', 'MIN', [10, 20]),
      game('g3', 'MIN', 'DET', [30, 3], 'playoffs')
    ]);
    const min = stats.find(s => s.team === 'MIN');
    expect(min).toMatchObject({ games: 2, pointsFor: 44, pointsAgainst: 27 });
    expect(min?.offense.totalYards).toBe(350 + 280);
    expect(min?.defense.totalYards).toBe(280 + 350);
    expect(stats.find(s => s.team === 'DET')?.games).toBe(0);
    expect(stats).toHaveLength(32);
  });
});
