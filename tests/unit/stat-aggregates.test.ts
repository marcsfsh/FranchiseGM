import { describe, expect, it } from 'vitest';
import {
  addGame,
  addTeamGame,
  careerTotals,
  type PlayerHistory,
  type TeamSeason
} from '../../src/engine/stats/aggregate';
import { CATEGORY_IDS, CATEGORY_KEYS, DERIVED_KEYS } from '../../src/engine/stats/categories';
import { DERIVED, passerRating } from '../../src/engine/stats/derived';
import {
  addGameRecords,
  addPlayerRecords,
  addTeamRecords,
  emptyRecords,
  RECORD_DEPTH
} from '../../src/engine/stats/records';
import { emptyTotals, STAT_KEYS } from '../../src/engine/sim/stats';

describe('stat categories (spec 9.2)', () => {
  it('puts every stored stat in exactly one category', () => {
    const stored = CATEGORY_IDS.flatMap(c => CATEGORY_KEYS[c]);
    expect(new Set(stored).size).toBe(stored.length);
    expect([...stored, ...DERIVED_KEYS].sort()).toEqual([...STAT_KEYS].sort());
  });
});

describe('derived stats (spec 9.2)', () => {
  it('computes the NFL passer rating and leaves empty rates unknown', () => {
    expect(passerRating({ passAtt: 20, passCmp: 20, passYds: 400, passTd: 5 })).toBeCloseTo(158.33, 1);
    expect(passerRating({ passAtt: 444, passCmp: 308, passYds: 4280, passTd: 31, passInt: 11 })).toBeCloseTo(
      113.0,
      1
    );
    expect(passerRating({})).toBeNull();
    expect(DERIVED.yardsPerCarry({ rushAtt: 0 })).toBeNull();
    expect(DERIVED.tackles({ soloTackles: 4, assistedTackles: 3 })).toBe(7);
  });
});

describe('player histories (spec 9.3)', () => {
  it('sums games into season lines by team and kind, keeps the longest, and skips the preseason', () => {
    let h: PlayerHistory = { id: 'p', seasons: [] };
    h = addGame(h, { rushAtt: 20, rushYds: 90, rushLong: 31, started: 1 }, 'MIN', 2026, 'regular');
    h = addGame(h, { rushAtt: 15, rushYds: 60, rushLong: 12 }, 'MIN', 2026, 'regular');
    h = addGame(h, { rushAtt: 30, rushYds: 200, rushLong: 80 }, 'MIN', 2026, 'preseason');
    h = addGame(h, { rushAtt: 18, rushYds: 70, rushLong: 20, started: 1 }, 'GB', 2026, 'regular');
    h = addGame(h, { rushAtt: 22, rushYds: 110, rushLong: 40, started: 1 }, 'GB', 2026, 'playoffs');
    h = addGame(h, {}, 'GB', 2027, 'regular');
    expect(h.seasons.map(s => [s.team, s.kind, s.games, s.starts])).toEqual([
      ['MIN', 'regular', 2, 1],
      ['GB', 'regular', 1, 1],
      ['GB', 'playoffs', 1, 1]
    ]);
    expect(h.seasons[0]?.totals).toEqual({ rushAtt: 35, rushYds: 150, rushLong: 31, started: 1 });
    const career = careerTotals(h);
    expect(career.games).toBe(3);
    expect(career.totals.rushYds).toBe(220);
    expect(career.totals.rushLong).toBe(31);
    expect(careerTotals(h, 'playoffs').totals.rushYds).toBe(110);
  });

  it('adds team games into records and totals', () => {
    const start: TeamSeason = {
      season: 2026, team: 'MIN', kind: 'regular', games: 0, wins: 0, losses: 0, ties: 0, pointsFor: 0,
      pointsAgainst: 0, totals: {}
    }; // prettier-ignore
    const t = { ...emptyTotals(), points: 24, passYds: 250 };
    const after = addTeamGame(addTeamGame(addTeamGame(start, t, 24, 17), t, 10, 20), t, 13, 13);
    expect([after.wins, after.losses, after.ties, after.pointsFor, after.pointsAgainst]).toEqual([
      1, 1, 1, 47, 50
    ]);
    expect(after.totals.passYds).toBe(750);
    expect(start.games).toBe(0);
  });
});

describe('records book (spec 18.5)', () => {
  it('keeps the best single games and reports a new record holder', () => {
    const book = emptyRecords();
    const broken = addGameRecords(book, [{ playerId: 'a', team: 'MIN', line: { rushYds: 150 } }], 2026, 'g1');
    expect(broken.map(b => [b.scope, b.stat, b.entry.value])).toEqual([['game', 'rushYds', 150]]);
    const again = addGameRecords(book, [{ playerId: 'b', team: 'GB', line: { rushYds: 120 } }], 2026, 'g2');
    expect(again).toEqual([]);
    expect(book.game.rushYds?.map(e => e.playerId)).toEqual(['a', 'b']);
    for (let i = 0; i < 20; i++)
      addGameRecords(book, [{ playerId: `x${i}`, team: 'DAL', line: { rushYds: 50 + i } }], 2026, `h${i}`);
    expect(book.game.rushYds).toHaveLength(RECORD_DEPTH);
    expect(book.game.rushYds?.[0]?.value).toBe(150);
  });

  it('replaces a player season and career entry as it grows', () => {
    const book = emptyRecords();
    const line = (yds: number) => ({
      season: 2026,
      team: 'MIN' as const,
      kind: 'regular' as const,
      games: 1,
      starts: 1,
      totals: { recYds: yds }
    });
    addPlayerRecords(book, [{ id: 'a', season: line(100), career: line(100), lastSeason: 2026 }]);
    addPlayerRecords(book, [{ id: 'a', season: line(1500), career: line(1500), lastSeason: 2026 }]);
    expect(book.season.recYds).toEqual([{ value: 1500, team: 'MIN', season: 2026, playerId: 'a' }]);
    expect(book.career.recYds).toHaveLength(1);
  });

  it('tracks team wins, points, and winning streaks', () => {
    const book = emptyRecords();
    const game = (id: string, won: boolean, points: number) => ({
      gameId: id,
      season: 2026,
      team: 'MIN' as const,
      points,
      won
    });
    addTeamRecords(book, game('g1', true, 30), 1, 30);
    addTeamRecords(book, game('g2', true, 45), 2, 75);
    addTeamRecords(book, game('g3', false, 3), 2, 78);
    addTeamRecords(book, game('g4', true, 20), 3, 98);
    expect(book.team.winStreak.map(e => [e.value, e.gameId])).toEqual([
      [2, 'g1'],
      [1, 'g4']
    ]);
    expect(book.team.gamePoints[0]?.value).toBe(45);
    expect(book.team.wins).toEqual([{ value: 3, team: 'MIN', season: 2026 }]);
    expect(book.team.points).toEqual([{ value: 98, team: 'MIN', season: 2026 }]);
  });
});
