import { describe, expect, it } from 'vitest';
import { superBowlNumber, superBowlVenue } from '../../src/data/super-bowl';
import { venueById } from '../../src/data/stadiums';
import type { TeamAbbr } from '../../src/data/team-colors';
import {
  byes,
  conferenceRound,
  conferenceRounds,
  superBowl,
  type Seed
} from '../../src/engine/season/playoffs';

const nfc = (teams: TeamAbbr[]): Seed[] => teams.map((abbr, i) => ({ abbr, seed: i + 1, conference: 'NFC' }));
const seeds = nfc(['DET', 'PHI', 'TB', 'LAR', 'MIN', 'WAS', 'GB']);

describe('the playoff bracket (spec 5.3)', () => {
  it('gives the top seed a bye and pairs 2-7, 3-6, and 4-5 with the higher seed at home', () => {
    expect(byes(7)).toBe(1);
    expect(conferenceRounds(7)).toBe(3);
    const round = conferenceRound(seeds, 1, 7);
    expect(round.map(g => [g.homeSeed, g.awaySeed])).toEqual([
      [2, 7],
      [3, 6],
      [4, 5]
    ]);
    expect(round[0]).toMatchObject({ home: 'PHI', away: 'GB', conference: 'NFC' });
  });

  it('re-seeds after every round: the top seed left hosts the lowest', () => {
    // The 7, 6, and 5 seeds all win on Wild Card weekend.
    const alive = seeds.filter(s => [1, 5, 6, 7].includes(s.seed));
    const round = conferenceRound(alive, 2, 7);
    expect(round.map(g => [g.homeSeed, g.awaySeed])).toEqual([
      [1, 7],
      [5, 6]
    ]);
    const final = conferenceRound(
      alive.filter(s => s.seed === 1 || s.seed === 5),
      3,
      7
    );
    expect(final).toEqual([
      { round: 3, conference: 'NFC', home: 'DET', away: 'MIN', homeSeed: 1, awaySeed: 5 }
    ]);
  });

  it('plays the Super Bowl at a neutral site, alternating the designated home team', () => {
    const afc: Seed = { abbr: 'KC', seed: 2, conference: 'AFC' };
    const champ: Seed = { abbr: 'DET', seed: 1, conference: 'NFC' };
    expect(superBowlNumber(2026)).toBe(61);
    // Odd-numbered Super Bowls list the NFC champion as the home team.
    expect(superBowl(afc, champ, 2026, 4)).toMatchObject({ home: 'DET', away: 'KC', conference: null });
    expect(superBowl(afc, champ, 2027, 4)).toMatchObject({ home: 'KC', away: 'DET' });
    expect(superBowlVenue(2026)).toBe('SOFI');
    for (let season = 2026; season < 2060; season++) expect(venueById(superBowlVenue(season))).toBeDefined();
  });
});
