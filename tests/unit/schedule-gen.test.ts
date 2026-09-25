import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseSchedule, type ScheduledGame } from '../../src/data/schedule';
import { TEAMS, divisionKey, homeStadium, team, type TeamAbbr } from '../../src/data/teams';
import { stream } from '../../src/engine/rng';
import { firstSunday, generateSchedule, thanksgiving } from '../../src/engine/season/generate-schedule';
import {
  extraPairs,
  interPairs,
  intraPairs,
  matchRotation,
  seasonMatchups,
  type Matchup
} from '../../src/engine/season/matchups';
import { TUNING } from '../../src/engine/tuning';

// Spec 5.2: schedules for 2027 and later, from rotations matched in the 2026 schedule.
const seed = parseSchedule(readFileSync('data-raw/schedule-2026.csv', 'utf8'), 2026);
const rotation = matchRotation(seed, 2026);
const S = TUNING.schedule;
const division = (abbr: TeamAbbr): string => divisionKey(team(abbr));
const key = (g: { away: string; home: string }): string => `${g.away}@${g.home}`;
const pairOf = (a: string, b: string): string => [a, b].sort().join('-');
const DIVISIONS = [...new Set(TEAMS.map(divisionKey))];
const WESTERN = new Set(['America/Los_Angeles', 'America/Denver', 'America/Phoenix']);

interface Season {
  year: number;
  places: Record<string, number>;
  champion: TeamAbbr;
  games: ScheduledGame[];
  matchups: Matchup[];
}

/** Twelve seasons after the seed year, each with random standings, records, and champion from the season before. */
const WINDOW: Season[] = (() => {
  const rng = stream(2026, 'window');
  return Array.from({ length: 12 }, (_, i) => {
    const year = 2027 + i;
    const places: Record<string, number> = {};
    for (const d of DIVISIONS)
      rng
        .shuffle(TEAMS.filter(t => divisionKey(t) === d).map(t => t.abbr))
        .forEach((t, p) => (places[t] = p + 1));
    const strength = Object.fromEntries(TEAMS.map(t => [t.abbr, rng.float()]));
    const champion = rng.pick(TEAMS).abbr;
    const games = generateSchedule(
      { season: year, seed, places, strength, champion },
      stream(year, 'schedule')
    );
    return { year, places, champion, games, matchups: seasonMatchups(rotation, year, places) };
  });
})();

describe('rotations (spec 5.2)', () => {
  it('matches the 2026 schedule and advances its cycles as the NFL does', () => {
    const seeded = new Set(seed.map(key));
    const fixed = seasonMatchups(rotation, 2026, {}).filter(m => m.kind !== 'place' && m.kind !== 'extra');
    expect(fixed).toHaveLength(224);
    expect(fixed.every(m => seeded.has(key(m)))).toBe(true);
    const names = (pairs: readonly (readonly [string, string])[]) => pairs.map(p => p.join(' vs '));
    // The NFL's published cycle: the AFC East meets the AFC South and NFC East in 2027, then the AFC North
    // and NFC West in 2028, and the AFC hosts the 17th game in odd years.
    expect(names(intraPairs(rotation, 'AFC', 2027))).toContain('AFC East vs AFC South');
    expect(names(intraPairs(rotation, 'NFC', 2027))).toContain('NFC East vs NFC South');
    expect(names(interPairs(rotation, 2027))).toContain('AFC East vs NFC East');
    expect(names(intraPairs(rotation, 'AFC', 2028))).toContain('AFC East vs AFC North');
    expect(names(interPairs(rotation, 2028))).toContain('AFC East vs NFC West');
    expect(extraPairs(rotation, 2026).host).toBe('NFC');
    expect(extraPairs(rotation, 2027).host).toBe('AFC');
    expect(names(extraPairs(rotation, 2027).pairs)).toEqual(names(interPairs(rotation, 2029)));
  });

  it('plays every opponent the right number of times over 12 years, alternating sites', () => {
    const meetings = new Map<string, { year: number; host: string; kind: string }[]>();
    const seasons = [{ year: 2026, matchups: seasonMatchups(rotation, 2026, {}) }, ...WINDOW];
    for (const { year, matchups } of seasons)
      for (const m of matchups) {
        if (m.kind !== 'conference' && m.kind !== 'interconference') continue;
        const p = pairOf(m.home, m.away);
        meetings.set(p, [...(meetings.get(p) ?? []), { year, host: m.home, kind: m.kind }]);
      }
    for (const a of TEAMS)
      for (const b of TEAMS) {
        if (a.abbr >= b.abbr || division(a.abbr) === division(b.abbr)) continue;
        const met = meetings.get(pairOf(a.abbr, b.abbr)) ?? [];
        const inWindow = met.filter(m => m.year >= 2027);
        // Every 3 years in the conference, every 4 across it.
        expect(inWindow, `${a.abbr}-${b.abbr}`).toHaveLength(a.conf === b.conf ? 4 : 3);
        met
          .slice(1)
          .forEach((m, i) => expect(m.host, `${a.abbr}-${b.abbr} ${m.year}`).not.toBe(met[i]?.host));
      }
    for (const { year, matchups } of WINDOW)
      for (const t of TEAMS) {
        const rivals = matchups.filter(
          m => m.kind === 'division' && (m.home === t.abbr || m.away === t.abbr)
        );
        expect(rivals, `${t.abbr} ${year}`).toHaveLength(6);
        expect(rivals.filter(m => m.home === t.abbr)).toHaveLength(3);
      }
  });

  it('meets same-place finishers outside the rotations, and alternates the 17th game host', () => {
    for (const { year, places, matchups } of WINDOW) {
      const rotating = new Set(
        [...intraPairs(rotation, 'AFC', year), ...intraPairs(rotation, 'NFC', year), ...interPairs(rotation, year)].map(p => p.join('|'))
      ); // prettier-ignore
      const extra = extraPairs(rotation, year);
      for (const m of matchups.filter(g => g.kind === 'place' || g.kind === 'extra')) {
        const [h, a] = [division(m.home), division(m.away)];
        expect(places[m.home], `${key(m)} ${year}`).toBe(places[m.away]);
        expect(rotating.has([h, a].sort().join('|')) || h === a).toBe(false);
        if (m.kind === 'place') expect(team(m.home).conf).toBe(team(m.away).conf);
        else {
          expect(team(m.home).conf).toBe(extra.host);
          expect(extra.pairs.map(p => p.join('|'))).toContain([h, a].sort().join('|'));
        }
      }
      for (const t of TEAMS) {
        const mine = matchups.filter(m => m.home === t.abbr || m.away === t.abbr);
        expect(mine.filter(m => m.kind === 'place')).toHaveLength(2);
        expect(mine.filter(m => m.kind === 'place' && m.home === t.abbr)).toHaveLength(1);
        expect(mine.filter(m => m.home === t.abbr)).toHaveLength(t.conf === extra.host ? 9 : 8);
      }
    }
  });
});

describe('generated schedules (spec 5.2)', () => {
  it('schedules every matchup once, with 17 games and one bye in weeks 5 to 14 for every team', () => {
    for (const { year, games, matchups } of WINDOW) {
      expect(games, `${year}`).toHaveLength(272);
      expect(new Set(games.map(g => g.id)).size).toBe(272);
      expect(games.map(key).sort()).toEqual(matchups.map(key).sort());
      for (const t of TEAMS) {
        const weeks = games.filter(g => g.home === t.abbr || g.away === t.abbr).map(g => g.week);
        expect(new Set(weeks).size, `${t.abbr} ${year}`).toBe(17);
        const bye = Array.from({ length: 18 }, (_, i) => i + 1).filter(w => !weeks.includes(w));
        expect(bye, `${t.abbr} ${year}`).toHaveLength(1);
        expect(bye[0]).toBeGreaterThanOrEqual(5);
        expect(bye[0]).toBeLessThanOrEqual(14);
      }
    }
  });

  it('keeps road trips short, rematches apart, and division games in the last week', () => {
    for (const { year, games } of WINDOW) {
      expect(games.filter(g => g.week === 18).every(g => division(g.home) === division(g.away)), `${year}`).toBe(true);
      for (const t of TEAMS) {
        const mine = games.filter(g => g.home === t.abbr || g.away === t.abbr).sort((a, b) => a.week - b.week);
        let run = 0;
        for (const g of mine) {
          run = g.away === t.abbr ? run + 1 : 0;
          expect(run, `${t.abbr} ${year} week ${g.week}`).toBeLessThanOrEqual(S.maxRoadStreak);
        }
        for (const rival of TEAMS.filter(r => r.abbr !== t.abbr && division(r.abbr) === division(t.abbr))) {
          const [a, b] = mine.filter(g => g.home === rival.abbr || g.away === rival.abbr).map(g => g.week) as [number, number];
          expect(Math.abs(a - b), `${t.abbr}-${rival.abbr} ${year}`).toBeGreaterThanOrEqual(S.rematchGap);
        }
      }
    }
  }); // prettier-ignore

  it('dates games on the new calendar with rest, holidays, and western hosts in the late window', () => {
    expect(firstSunday(2026)).toBe('2026-09-13');
    expect(firstSunday(2027)).toBe('2027-09-12');
    expect(thanksgiving(2026)).toBe('2026-11-26');
    expect(thanksgiving(2030)).toBe('2030-11-28');
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (const { year, games, champion } of WINDOW) {
      const sunday1 = Date.parse(`${firstSunday(year)}T12:00:00Z`);
      for (const g of games) {
        const day = Math.round((Date.parse(`${g.date}T12:00:00Z`) - sunday1) / 86_400_000) - 7 * (g.week - 1);
        expect(day, `${g.id} ${g.date}`).toBeGreaterThanOrEqual(-4);
        expect(day, `${g.id} ${g.date}`).toBeLessThanOrEqual(1);
        expect(g.day).toBe(days[new Date(`${g.date}T12:00:00Z`).getUTCDay()]);
        if (g.siteType === 'home') expect(g.venue).toBe(homeStadium(g.home).id);
        if (g.siteType === 'home' && g.day === 'Sun' && WESTERN.has(homeStadium(g.home).timeZone))
          expect(g.timeEt, g.id).not.toBe('13:00');
      }
      const kickoff = (g: ScheduledGame) => `${g.date} ${g.timeEt}`;
      const opener = games.filter(g => g.week === 1).sort((a, b) => (kickoff(a) < kickoff(b) ? -1 : 1))[0];
      expect(opener?.home, `${year}`).toBe(champion);
      const feast = games.filter(g => g.date === thanksgiving(year)).map(g => g.home);
      expect(feast, `${year}`).toEqual(expect.arrayContaining(['DET', 'DAL']));
      expect(games.filter(g => g.siteType === 'international').length, `${year}`).toBeGreaterThan(0);
      for (const t of TEAMS) {
        const dates = games.filter(g => g.home === t.abbr || g.away === t.abbr).map(g => Date.parse(`${g.date}T12:00:00Z`)).sort((a, b) => a - b);
        dates.slice(1).forEach((d, i) => expect((d - (dates[i] ?? 0)) / 86_400_000, `${t.abbr} ${year}`).toBeGreaterThanOrEqual(S.minRestDays));
      }
    }
    // Christmas games move to Christmas Day: a Saturday in 2027, a Monday in 2028 (with Monday night).
    const christmas = (year: number) => WINDOW.find(s => s.year === year)?.games.filter(g => g.date === `${year}-12-25`) ?? [];
    expect(christmas(2027).map(g => g.day)).toEqual(['Sat', 'Sat', 'Sat']);
    expect(christmas(2028).map(g => g.timeEt)).toEqual(['13:00', '16:30', '20:15']);
  }); // prettier-ignore

  it('repeats exactly from the same seed and differs with another', () => {
    const input = { season: 2027, seed, places: {}, strength: {}, champion: 'SEA' as const };
    const a = generateSchedule(input, stream(1, 'schedule'));
    expect(generateSchedule(input, stream(1, 'schedule'))).toEqual(a);
    expect(generateSchedule(input, stream(2, 'schedule')).map(g => g.id)).not.toEqual(a.map(g => g.id));
  });
});
