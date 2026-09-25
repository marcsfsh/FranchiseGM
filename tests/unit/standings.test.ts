import { describe, expect, it } from 'vitest';
import type { TeamAbbr } from '../../src/data/team-colors';
import {
  buildStandings,
  explainTiebreak,
  rankLeague,
  tiebreaks,
  winPct,
  type GameScore
} from '../../src/engine/season/standings';

/** A season's finished games, built one result at a time. */
function season() {
  const games: GameScore[] = [];
  let week = 1;
  const api = {
    games,
    /** `winner` beats `loser` at home, 24-17 (three touchdowns to two) unless given. */
    win(winner: TeamAbbr, loser: TeamAbbr, score: [number, number] = [24, 17]) {
      games.push({
        week: week++,
        home: winner,
        away: loser,
        homeScore: score[0],
        awayScore: score[1],
        homeTd: Math.floor(score[0] / 7),
        awayTd: Math.floor(score[1] / 7)
      });
      return api;
    },
    tie(home: TeamAbbr, away: TeamAbbr, points = 20) {
      games.push({ week: week++, home, away, homeScore: points, awayScore: points, homeTd: 2, awayTd: 2 });
      return api;
    }
  };
  return api;
}

const order = (ranked: readonly { abbr: TeamAbbr }[]) => ranked.map(r => r.abbr);
const division = (games: GameScore[], name: string, coin = 1) =>
  rankLeague(games, coin, 7).divisions.find(d => d.division === name)?.teams ?? [];

describe('standings (spec 5.3)', () => {
  it('keeps records, points, streaks, and strength of victory and schedule', () => {
    const s = season()
      .win('MIN', 'GB')
      .win('GB', 'CHI', [31, 3])
      .win('MIN', 'KC')
      .tie('CHI', 'MIN')
      .win('KC', 'GB');
    const t = buildStandings(s.games).records;
    expect(t.MIN.overall).toEqual({ wins: 2, losses: 0, ties: 1 });
    expect(t.MIN.division).toEqual({ wins: 1, losses: 0, ties: 1 });
    expect(t.MIN.conference).toEqual({ wins: 1, losses: 0, ties: 1 });
    expect(t.MIN.pointsFor).toBe(24 + 24 + 20);
    expect(t.MIN.streak).toBe('T1');
    expect(t.GB.streak).toBe('L1');
    expect(winPct(t.MIN.overall)).toBeCloseTo(2.5 / 3, 10);
    // MIN beat GB (1-2) and KC (1-1): strength of victory is their combined record, 2-3.
    expect(t.MIN.sov).toBeCloseTo(2 / 5, 10);
    // MIN played GB, KC, and CHI (0-1-1): 2-4-1 combined.
    expect(t.MIN.sos).toBeCloseTo(2.5 / 7, 10);
  });

  it('breaks a two-club division tie head-to-head first', () => {
    const s = season().win('MIN', 'GB').win('GB', 'DET').win('CHI', 'MIN');
    const teams = division(s.games, 'NFC North');
    expect(order(teams)).toEqual(['CHI', 'MIN', 'GB', 'DET']);
    expect(teams[1]?.tiebreak).toBe('Head-to-head');
  });

  it('explains a tie between different records at the same winning percentage', () => {
    // MIN 2-0 with two division wins; GB 1-0 with a win outside the division: both 1.000.
    const s = season().win('MIN', 'CHI').win('MIN', 'DET').win('GB', 'KC');
    const teams = division(s.games, 'NFC North');
    const table = buildStandings(s.games);
    const notes = tiebreaks(teams, table);
    expect(notes[0]).toEqual({ abbr: 'MIN', over: ['GB'], step: 'Division record' });
    expect(explainTiebreak(notes[0] as (typeof notes)[number], table, abbr => `the ${abbr}`)).toBe(
      'The MIN are ahead of the GB, with the same winning percentage (1.000), on division record.'
    );
  });

  it('goes to the division record when head-to-head is split', () => {
    // MIN and GB finish 2-2 and split their games; MIN went 2-1 in the division, GB 1-2.
    const s = season()
      .win('MIN', 'GB')
      .win('GB', 'MIN')
      .win('MIN', 'DET')
      .win('NYG', 'MIN')
      .win('DET', 'GB')
      .win('GB', 'NYG')
      .win('NYG', 'DET')
      .win('WAS', 'DET');
    const teams = division(s.games, 'NFC North');
    expect(order(teams).slice(0, 2)).toEqual(['MIN', 'GB']);
    expect(teams[0]?.tiebreak).toBe('Division record');
  });

  it('goes to common games when head-to-head and the division record are even', () => {
    // MIN and GB finish 3-2, split their games, and went 1-1 in the division. Both played KC and LV:
    // MIN won both, GB split them.
    const s = season()
      .win('MIN', 'GB')
      .win('GB', 'MIN')
      .win('MIN', 'KC')
      .win('MIN', 'LV')
      .win('DAL', 'MIN')
      .win('GB', 'KC')
      .win('LV', 'GB')
      .win('GB', 'NYG');
    const teams = division(s.games, 'NFC North');
    expect(order(teams).slice(0, 2)).toEqual(['MIN', 'GB']);
    expect(teams[0]?.tiebreak).toBe('Common games');
  });

  it('separates three tied clubs by their games among each other, then starts over with two', () => {
    // MIN, GB, and CHI all finish 2-2; MIN went 2-0 against the other two, who split.
    const s = season()
      .win('MIN', 'GB')
      .win('MIN', 'CHI')
      .win('GB', 'CHI')
      .win('CHI', 'GB')
      .win('KC', 'MIN')
      .win('DEN', 'MIN')
      .win('GB', 'KC')
      .win('CHI', 'DEN');
    const teams = division(s.games, 'NFC North');
    expect(order(teams)[0]).toBe('MIN');
    expect(teams[0]?.tiebreak).toBe('Head-to-head');
    // GB and CHI match on everything after that, down to the coin toss.
    expect(order(teams).slice(1, 3).sort()).toEqual(['CHI', 'GB']);
    expect(teams[1]?.tiebreak).toBe('Coin toss');
    // Explained in order: MIN over both, then the coin toss winner over the other.
    const [second, third] = order(teams).slice(1, 3) as [TeamAbbr, TeamAbbr];
    const table = buildStandings(s.games);
    const notes = tiebreaks(teams, table);
    expect(notes).toEqual([
      { abbr: 'MIN', over: [second, third], step: 'Head-to-head' },
      { abbr: second, over: [third], step: 'Coin toss' }
    ]);
    expect(notes.map(n => explainTiebreak(n, table, abbr => `the ${abbr}`))).toEqual([
      `The MIN are ahead of the ${second} and the ${third}, also 2–2, on head-to-head record.`,
      `The ${second} are ahead of the ${third}, also 2–2, on a coin toss.`
    ]);
  });

  it('seeds division winners first, and lets only the best club of a division into a wild card tie', () => {
    const s = season();
    const afc: TeamAbbr[] = ['NYJ', 'NE', 'BUF', 'MIA', 'BAL', 'PIT', 'CLE', 'CIN', 'HOU', 'IND', 'JAX', 'TEN', 'KC', 'LV', 'LAC', 'DEN']; // prettier-ignore
    let next = 0;
    const beatAfc = (team: TeamAbbr, times: number) => {
      for (let i = 0; i < times; i++) s.win(team, afc[next++ % afc.length] as TeamAbbr);
    };
    // Four division winners at 4-0.
    for (const team of ['PHI', 'DET', 'TB', 'SF'] as const) beatAfc(team, 4);
    // Four clubs at 3-1 for three wild cards: MIN beat GB, so the division tiebreaker puts MIN ahead.
    s.win('MIN', 'GB');
    beatAfc('MIN', 2);
    s.win('BUF', 'MIN');
    beatAfc('GB', 3);
    for (const team of ['SEA', 'DAL'] as const) {
      beatAfc(team, 3);
      s.win('KC', team);
    }
    const nfc = rankLeague(s.games, 7, 7).conferences.find(c => c.conference === 'NFC');
    const seeds = order(nfc?.seeds ?? []);
    expect(seeds.slice(0, 4).sort()).toEqual(['DET', 'PHI', 'SF', 'TB']);
    // MIN has the only conference win among the wild card clubs.
    expect(seeds[4]).toBe('MIN');
    expect(nfc?.seeds[4]?.tiebreak).toBe('Conference record');
    expect(seeds).toHaveLength(7);
    expect(seeds.indexOf('GB')).toBeGreaterThan(seeds.indexOf('MIN'));
  });

  it('gives a wild card tie to a club that swept the others', () => {
    // Three 1-1 clubs from different NFC divisions: ARI beat both of the others.
    const s = season().win('ARI', 'NO').win('ARI', 'WAS').win('KC', 'ARI').win('NO', 'KC').win('WAS', 'LV');
    s.win('NO', 'WAS').win('BAL', 'NO').win('WAS', 'DEN');
    // NO and WAS end 2-2, ARI 2-1: make ARI 2-2 too.
    s.win('HOU', 'ARI');
    const nfc = rankLeague(s.games, 3, 7).conferences.find(c => c.conference === 'NFC');
    const ranked = [...(nfc?.seeds ?? []), ...(nfc?.rest ?? [])];
    const pos = (abbr: TeamAbbr) => ranked.findIndex(r => r.abbr === abbr);
    expect(pos('ARI')).toBeLessThan(pos('NO'));
    expect(pos('ARI')).toBeLessThan(pos('WAS'));
    expect(ranked[pos('ARI')]?.tiebreak).toBe('Head-to-head sweep');
  });

  describe('seeding tied division winners by the wild card procedure', () => {
    // ARI and NO win their divisions playing AFC clubs only and never meeting, so head-to-head doesn't
    // apply and their conference records are even.
    const topSeeds = (games: GameScore[]) =>
      rankLeague(games, 5, 7)
        .conferences.find(c => c.conference === 'NFC')
        ?.seeds.slice(0, 2) ?? [];

    it('uses common games when both clubs played at least four of them', () => {
      // Common opponents KC, LV, LAC, and DEN: ARI went 3-1 against them, NO 2-2.
      const s = season()
        .win('ARI', 'KC')
        .win('ARI', 'LV')
        .win('ARI', 'LAC')
        .win('DEN', 'ARI')
        .win('NE', 'ARI')
        .win('NO', 'KC')
        .win('NO', 'LV')
        .win('LAC', 'NO')
        .win('DEN', 'NO')
        .win('NO', 'NYJ');
      const seeds = topSeeds(s.games);
      expect(order(seeds)).toEqual(['ARI', 'NO']);
      expect(seeds[0]?.tiebreak).toBe('Common games');
    });

    it('skips common games under the four-game minimum and goes to strength of victory', () => {
      // Three common opponents (DEN, LV, LAC): ARI went 2-1 against them and NO 1-2, but that doesn't
      // count. NO's wins came against better clubs: NYJ finishes 2-1.
      const s = season()
        .win('ARI', 'DEN')
        .win('ARI', 'LV')
        .win('LAC', 'ARI')
        .win('KC', 'ARI')
        .win('DEN', 'NO')
        .win('NO', 'LV')
        .win('LAC', 'NO')
        .win('NO', 'NYJ')
        .win('NYJ', 'MIA')
        .win('NYJ', 'BUF');
      const seeds = topSeeds(s.games);
      expect(order(seeds)).toEqual(['NO', 'ARI']);
      expect(seeds[0]?.tiebreak).toBe('Strength of victory');
      const records = buildStandings(s.games).records;
      expect(records.NO.sov).toBeCloseTo(2 / 5, 10);
      expect(records.ARI.sov).toBeCloseTo(1 / 4, 10);
      // Under a rule set that asks for three common games, they decide it.
      const three = rankLeague(s.games, 5, 7, 3).conferences.find(c => c.conference === 'NFC')?.seeds ?? [];
      expect(three[0]?.abbr).toBe('ARI');
      expect(three[0]?.tiebreak).toBe('Common games');
    });

    it('goes to strength of schedule when strength of victory is even', () => {
      // ARI and NO each beat a 0-1 club; ARI lost to a 2-0 club and NO to a 1-1 club.
      const s = season()
        .win('ARI', 'KC')
        .win('DEN', 'ARI')
        .win('DEN', 'LAC')
        .win('NO', 'LV')
        .win('NYJ', 'NO')
        .win('MIA', 'NYJ');
      const seeds = topSeeds(s.games);
      expect(order(seeds)).toEqual(['ARI', 'NO']);
      expect(seeds[0]?.tiebreak).toBe('Strength of schedule');
    });
  });

  it('ends a tie nothing else separates with a coin toss drawn from the seed', () => {
    const first = (coin: number) => order(division([], 'AFC West', coin));
    expect(first(11)).toEqual(first(11));
    expect(new Set([first(1), first(2), first(3), first(4)].map(o => o.join())).size).toBeGreaterThan(1);
    expect(division([], 'AFC West', 5)[0]?.tiebreak).toBe('Coin toss');
  });
});
