import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseSchedule, type ScheduledGame } from '../../src/data/schedule';
import { venueById } from '../../src/data/stadiums';
import type { TeamAbbr } from '../../src/data/team-colors';
import { homeStadium } from '../../src/data/teams';
import { createLeague, defaultStartOptions } from '../../src/engine/league/create';
import { homeField } from '../../src/engine/sim/setup';
import { defaultSliders } from '../../src/engine/sim/sliders';
import type { GameWeather } from '../../src/engine/sim/types';
import { TUNING } from '../../src/engine/tuning';
import { nameData } from '../helpers/base-data';

const S = TUNING.sim;
const league = createLeague({
  id: 'home-field',
  name: 'Home field',
  start: defaultStartOptions('MIN', 3),
  gameVersion: 'test',
  names: nameData(),
  schedule: parseSchedule(readFileSync('data-raw/schedule-2026.csv', 'utf8'), 2026),
  fixed: true
});
const sliders = defaultSliders();
const game = (away: TeamAbbr, home: TeamAbbr, timeEt = '13:00'): ScheduledGame => ({
  id: `test-${away}-${home}`,
  season: 2026,
  week: 6,
  day: 'Sun',
  date: '2026-10-18',
  timeEt,
  away,
  home,
  siteType: 'home',
  venue: homeStadium(home).id
});
const mild: GameWeather = { indoor: false, tempF: 62, windMph: 6, precipitation: 'none', altitudeFt: 0 };
const field = (g: ScheduledGame, weather = mild) =>
  homeField(league, g, venueById(g.venue), weather, sliders);

describe('home field sources (spec 17.3)', () => {
  it('gives the crowd to the home team only, scaled by stadium noise', () => {
    const f = field(game('CHI', 'GB'));
    expect(f.home.crowd).toBeCloseTo(S.homeCrowd * venueById('GB').noise);
    expect(f.away.crowd).toBe(0);
    expect(f.falseStarts).toBeGreaterThan(1);
  });

  it('costs a western team flying east for a kickoff in its body clock morning', () => {
    expect(field(game('SF', 'NYG', '13:00')).away.early).toBeCloseTo(-S.earlyEastbound);
    expect(field(game('SF', 'NYG', '16:25')).away.early).toBe(0);
    expect(field(game('NYG', 'SF', '16:05')).away.early).toBe(0);
    expect(field(game('SF', 'NYG')).away.travel).toBeCloseTo(-3 * S.travelPerZone);
  });

  it('trims the home edge in division games', () => {
    expect(field(game('MIN', 'GB')).away.familiarity).toBeCloseTo(S.divisionFamiliarity);
    expect(field(game('SF', 'GB')).away.familiarity).toBe(0);
    expect(field(game('MIN', 'GB')).home.familiarity).toBe(0);
  });

  it('costs dome teams outdoors in the cold, scaled by the weather slider', () => {
    const cold: GameWeather = { ...mild, tempF: 21 };
    expect(field(game('MIN', 'GB'), cold).away.cold).toBeCloseTo(-S.domeCold);
    expect(field(game('CHI', 'GB'), cold).away.cold).toBe(0);
    expect(field(game('GB', 'MIN'), { ...cold, indoor: true }).home.cold).toBe(0);
    const calm = { ...sliders, general: { ...sliders.general, weatherImpact: 0 } };
    const g = game('MIN', 'GB');
    expect(homeField(league, g, venueById(g.venue), cold, calm).away.cold).toBeCloseTo(0);
  });
});
