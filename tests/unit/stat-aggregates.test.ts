import { describe, expect, it } from 'vitest';
import { playoffRoundName } from '../../src/engine/model/calendar';
import {
  addGame,
  addTeamGame,
  careerTotals,
  type PlayerHistory,
  type SeasonLine,
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
    // The career line carries his latest team, and the log lists every season with a stored game.
    expect(career.team).toBe('GB');
    expect(h.logSeasons).toEqual([2026]);
    expect(addGame(h, { rushAtt: 5 }, 'GB', 2027, 'preseason').logSeasons).toEqual([2026, 2027]);
  });

  it('names playoff rounds from the rule set', () => {
    const rules = { weeks: 18, playoffTeamsPerConference: 7 };
    expect([19, 20, 21, 22].map(w => playoffRoundName(w, rules))).toEqual([
      'Wild Card',
      'Divisional',
      'Conference',
      'Super Bowl'
    ]);
    // A 4-team bracket after a 17-week season has no wild card round.
    expect(playoffRoundName(18, { weeks: 17, playoffTeamsPerConference: 4 })).toBe('Divisional');
    expect(playoffRoundName(20, { weeks: 17, playoffTeamsPerConference: 4 })).toBe('Super Bowl');
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
  it('keeps the best single games and reports records that change hands', () => {
    const book = emptyRecords();
    // The first entry in an empty list isn't news.
    expect(
      addGameRecords(book, [{ playerId: 'a', team: 'MIN', line: { rushYds: 150 } }], 2026, 'g1')
    ).toEqual([]);
    expect(addGameRecords(book, [{ playerId: 'b', team: 'GB', line: { rushYds: 120 } }], 2026, 'g2')).toEqual(
      []
    );
    expect(book.game.rushYds?.map(e => e.playerId)).toEqual(['a', 'b']);
    for (let i = 0; i < 20; i++)
      addGameRecords(book, [{ playerId: `x${i}`, team: 'DAL', line: { rushYds: 50 + i } }], 2026, `h${i}`);
    expect(book.game.rushYds).toHaveLength(RECORD_DEPTH);
    expect(book.game.rushYds?.[0]?.value).toBe(150);
    const broken = addGameRecords(book, [{ playerId: 'c', team: 'CHI', line: { rushYds: 160 } }], 2026, 'g3');
    expect(broken.map(b => [b.scope, b.stat, b.entry.playerId, b.previous?.playerId])).toEqual([
      ['game', 'rushYds', 'c', 'a']
    ]);
    // A tie with the record goes behind it.
    addGameRecords(book, [{ playerId: 'd', team: 'CHI', line: { rushYds: 160 } }], 2026, 'g4');
    expect(book.game.rushYds?.slice(0, 2).map(e => e.playerId)).toEqual(['c', 'd']);
  });

  const seasonLine = (yds: number, team: SeasonLine['team'] = 'MIN', season = 2026): SeasonLine => ({
    season,
    team,
    kind: 'regular',
    games: 1,
    starts: 1,
    totals: { recYds: yds }
  });

  it('replaces a player season and career entry as it grows, without calling it news', () => {
    const book = emptyRecords();
    const line = seasonLine;
    addPlayerRecords(book, [{ id: 'a', season: line(100), career: line(100), lastSeason: 2026 }]);
    const broken = addPlayerRecords(book, [
      { id: 'a', season: line(1500), career: line(1500), lastSeason: 2026 }
    ]);
    expect(broken).toEqual([]);
    expect(book.season.recYds).toEqual([{ value: 1500, team: 'MIN', season: 2026, playerId: 'a' }]);
    expect(book.career.recYds).toHaveLength(1);
    // Another player passing him breaks both records.
    const passed = addPlayerRecords(book, [
      { id: 'b', season: line(1600, 'GB'), career: line(1600, 'GB'), lastSeason: 2026 }
    ]);
    expect(passed.map(b => [b.scope, b.entry.playerId, b.previous?.playerId])).toEqual([
      ['season', 'b', 'a'],
      ['career', 'b', 'a']
    ]);
  });

  it('keeps one season entry for a traded player, under his new team', () => {
    const book = emptyRecords();
    addPlayerRecords(book, [{ id: 'a', season: seasonLine(900), career: seasonLine(900), lastSeason: 2026 }]);
    const traded = seasonLine(1600, 'GB');
    addPlayerRecords(book, [{ id: 'a', season: traded, career: traded, lastSeason: 2026 }]);
    expect(book.season.recYds).toEqual([{ value: 1600, team: 'GB', season: 2026, playerId: 'a' }]);
  });

  it('gives ties to the earlier achievement and drops totals that fall to zero', () => {
    const book = emptyRecords();
    const add = (id: string, yds: number, season = 2026) =>
      addPlayerRecords(book, [
        {
          id,
          season: seasonLine(yds, 'MIN', season),
          career: seasonLine(yds, 'MIN', season),
          lastSeason: season
        }
      ]);
    add('a', 1000);
    add('b', 1000);
    // An unchanged total keeps its place.
    add('a', 1000);
    expect(book.season.recYds?.map(e => e.playerId)).toEqual(['a', 'b']);
    // An earlier season's total wins a tie with a later one.
    add('c', 1000, 2025);
    expect(book.season.recYds?.map(e => e.playerId)).toEqual(['c', 'a', 'b']);
    add('b', -4);
    expect(book.season.recYds?.map(e => e.playerId)).toEqual(['c', 'a']);
    expect(book.career.recYds?.map(e => e.playerId)).toEqual(['c', 'a']);
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
