import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseClimate } from '../../src/data/climate';
import { parseSchedule } from '../../src/data/schedule';
import { team } from '../../src/data/teams';
import { createLeague, defaultStartOptions } from '../../src/engine/league/create';
import type { League } from '../../src/engine/league/types';
import { advanceWeek, gameWeek, weekGames } from '../../src/engine/season/advance';
import { leagueStandings } from '../../src/engine/season/state';
import { available } from '../../src/engine/sim/setup';
import { nameData } from '../helpers/base-data';

const schedule = parseSchedule(readFileSync('data-raw/schedule-2026.csv', 'utf8'), 2026);
const climate = parseClimate(readFileSync('data-raw/climate.csv', 'utf8'));
const league = (): League =>
  createLeague({
    id: 'season',
    name: 'Season',
    start: defaultStartOptions('MIN', 44),
    gameVersion: 'test',
    names: nameData(),
    schedule,
    fixed: true
  });
const input = { actions: 0, entropy: 0 };

// A whole season is the slowest test in the suite.
describe('the season loop (spec 4.2, 5.3)', { timeout: 120_000 }, () => {
  it('replays a week exactly in a fixed-seed league', () => {
    const a = advanceWeek(league(), climate, input);
    const b = advanceWeek(league(), climate, input);
    expect(a.games.map(g => g.result.score)).toEqual(b.games.map(g => g.result.score));
    expect(a.league.date).toEqual({ season: 2026, phase: 'regularSeason', week: 2 });
    expect(a.games).toHaveLength(schedule.filter(g => g.week === 1).length);
    expect(a.games.every(g => g.meta.kind === 'regular' && g.meta.week === 1)).toBe(true);
  });

  it('plays week 1 through the Super Bowl: seeds, byes, re-seeding, and one champion', () => {
    const l = league();
    while (l.date.phase === 'regularSeason') advanceWeek(l, climate, input);
    expect(Object.values(l.season.results)).toHaveLength(272);
    expect(l.date).toMatchObject({ phase: 'wildCard', week: 1 });
    const standings = leagueStandings(l);
    for (const conference of ['AFC', 'NFC'] as const) {
      const seeds = l.season.seeds?.[conference] ?? [];
      expect(seeds).toHaveLength(7);
      // The four division winners take the top seeds.
      const winners = standings.divisions.filter(d => d.conference === conference).map(d => d.teams[0]?.abbr);
      expect(seeds.slice(0, 4).sort()).toEqual([...winners].sort());
      expect(seeds.every(abbr => team(abbr).conf === conference)).toBe(true);
    }
    // Wild Card weekend: six games, the higher seed at home, the top seeds resting.
    const wildCard = weekGames(l);
    expect(wildCard).toHaveLength(6);
    expect(gameWeek(l)).toBe(19);
    for (const g of wildCard) {
      const seeds = l.season.seeds?.[team(g.home).conf] ?? [];
      expect(seeds.indexOf(g.home)).toBeLessThan(seeds.indexOf(g.away));
      expect(seeds.indexOf(g.home)).toBeGreaterThan(0);
    }
    while (l.date.phase !== 'staff') advanceWeek(l, climate, input);
    const playoffs = Object.values(l.season.results).filter(g => g.playoff);
    expect(playoffs).toHaveLength(13);
    expect(playoffs.every(g => g.homeScore !== g.awayScore)).toBe(true);
    const final = playoffs.find(g => g.week === 22);
    expect(final).toBeDefined();
    expect(l.season.champion).toBe(final && (final.homeScore > final.awayScore ? final.home : final.away));
    // The Super Bowl is at a neutral site between the conference champions.
    const sb = l.schedule.find(g => g.week === 22);
    expect(sb?.siteType).toBe('neutral');
    expect(team(sb?.home ?? 'MIN').conf).not.toBe(team(sb?.away ?? 'MIN').conf);
  });

  it('keeps players out while they are hurt and lets questionable players be rested', () => {
    const l = league();
    const [a, b] = Object.values(l.players).filter(p => p.team === 'MIN' && p.status === 'active');
    if (!a || !b) throw new Error('no players');
    a.injury = { bodyPart: 'knee', severity: 'medium', weeksOut: 3, lingering: 2, fragile: 4, season: 2026, week: 1, career: false }; // prettier-ignore
    b.injury = { bodyPart: 'ankle', severity: 'short', weeksOut: 0, lingering: 2, fragile: 2, season: 2026, week: 1, career: false }; // prettier-ignore
    expect(available(l, a)).toBe(false);
    expect(available(l, b)).toBe(true);
    l.teams.MIN.resting = [b.id];
    expect(available(l, b)).toBe(false);
    advanceWeek(l, climate, input);
    expect(l.players[a.id]?.injury?.weeksOut).toBeGreaterThanOrEqual(2);
  });
});
