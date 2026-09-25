import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseSchedule } from '../../src/data/schedule';
import { TEAM_ABBRS } from '../../src/data/team-colors';
import { TEAMS, divisionOf } from '../../src/data/teams';

const games = parseSchedule(readFileSync('data-raw/schedule-2026.csv', 'utf8'), 2026);

describe('2026 schedule (spec 5.1)', () => {
  it('has 272 games over 18 weeks', () => {
    expect(games).toHaveLength(272);
    expect(new Set(games.map(g => g.week)).size).toBe(18);
    expect(new Set(games.map(g => g.id)).size).toBe(272);
  });

  it('gives every team 17 games, one bye in weeks 5 to 14, and no doubleheaders', () => {
    for (const abbr of TEAM_ABBRS) {
      const mine = games.filter(g => g.home === abbr || g.away === abbr);
      expect(mine, abbr).toHaveLength(17);
      const weeks = mine.map(g => g.week);
      expect(new Set(weeks).size, abbr).toBe(17);
      const bye = Array.from({ length: 18 }, (_, i) => i + 1).filter(w => !weeks.includes(w));
      expect(bye, abbr).toHaveLength(1);
      expect(bye[0], abbr).toBeGreaterThanOrEqual(5);
      expect(bye[0], abbr).toBeLessThanOrEqual(14);
    }
  });

  it('plays each division rival home and away', () => {
    for (const t of TEAMS) {
      for (const rival of divisionOf(t.abbr).filter(a => a !== t.abbr)) {
        expect(
          games.filter(g => g.home === t.abbr && g.away === rival),
          `${rival}@${t.abbr}`
        ).toHaveLength(1);
      }
    }
  });

  it('places international games at their venues', () => {
    const intl = games.filter(g => g.siteType === 'international');
    expect(intl.map(g => `${g.away}@${g.home}:${g.venue}`)).toEqual([
      'SF@LAR:MCG',
      'BAL@DAL:MARA',
      'IND@WAS:TOTT',
      'PHI@JAX:TOTT',
      'HOU@JAX:WEMB',
      'PIT@NO:SDF',
      'CIN@ATL:BERN',
      'NE@DET:ALLZ',
      'MIN@SF:AZTE'
    ]);
    for (const g of games.filter(x => x.siteType === 'home')) expect(g.venue).not.toBe('');
  });

  it('rejects bad rows with a line number', () => {
    const head = 'week,day,date,time_et,away,home,site_type,site_name\n';
    expect(() => parseSchedule(`${head}1,Sun,2026-09-13,13:00,XXX,MIN,home,x\n`, 2026)).toThrow(/line 2/);
    expect(() =>
      parseSchedule(`${head}1,Sun,2026-09-13,13:00,DET,MIN,international,Nowhere\n`, 2026)
    ).toThrow(/unknown venue/);
  });
});
