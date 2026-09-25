import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseClimate } from '../../src/data/climate';
import { parseColleges, parseFirstNames, parseHometowns, parseSurnames } from '../../src/data/names';
import { ALL_VENUES, STADIUMS } from '../../src/data/stadiums';
import { DIVISIONS, TEAMS, homeStadium } from '../../src/data/teams';

const raw = (name: string) => readFileSync(`data-raw/${name}`, 'utf8');

describe('teams and stadiums (spec 6.2, 17.1)', () => {
  it('has 32 teams in 8 divisions and a home stadium for each', () => {
    expect(TEAMS).toHaveLength(32);
    expect(DIVISIONS).toHaveLength(8);
    for (const t of TEAMS) expect(homeStadium(t.abbr).country).toBe('USA');
    expect(homeStadium('LAR')).toBe(homeStadium('LAC'));
    expect(homeStadium('NYG')).toBe(homeStadium('NYJ'));
    expect(STADIUMS).toHaveLength(30);
  });

  it('gives every venue plausible facts and a climate station with 12 months', () => {
    const climate = parseClimate(raw('climate.csv'));
    const ids = new Set<string>();
    for (const venue of ALL_VENUES) {
      expect(ids.has(venue.id), venue.id).toBe(false);
      ids.add(venue.id);
      expect(venue.capacity).toBeGreaterThan(40000);
      expect(['open', 'dome', 'retractable']).toContain(venue.roof);
      expect(['grass', 'turf']).toContain(venue.surface);
      expect(venue.noise).toBeGreaterThan(0);
      expect(venue.noise).toBeLessThanOrEqual(1);
      const months = climate[venue.climate];
      expect(months, venue.climate).toHaveLength(12);
      for (const m of months ?? []) {
        expect(m.highF).toBeGreaterThan(m.lowF);
        expect(m.windMph).toBeGreaterThan(0);
      }
    }
    expect(climate.GRB?.[11]?.highF).toBeLessThan(climate.MIA?.[11]?.highF ?? 0);
    expect(ALL_VENUES.find(v => v.id === 'DEN')?.altitudeFt).toBe(5280);
  });
});

describe('name, hometown, and college lists (spec 10.1)', () => {
  it('has about 3,000 first names weighted by birth year', () => {
    const first = parseFirstNames(raw('first-names.csv'));
    expect(first.names).toHaveLength(3000);
    expect(first.buckets[0]).toBe(1975);
    expect(first.weights).toHaveLength(first.buckets.length);
    for (const bucket of first.weights) expect(bucket).toHaveLength(3000);
    expect(first.names).toContain('Michael');
  });

  it('has 5,000 surnames, 1,540 hometowns with an international share, and weighted colleges', () => {
    expect(parseSurnames(raw('surnames.csv')).names).toHaveLength(5000);
    const towns = parseHometowns(raw('hometowns.csv'));
    const total = towns.weights.reduce((a, b) => a + b, 0);
    const intl = towns.weights.filter((_, i) => towns.countries[i] !== 'USA').reduce((a, b) => a + b, 0);
    expect(intl / total).toBeGreaterThan(0.02);
    expect(intl / total).toBeLessThan(0.04);
    const colleges = parseColleges(raw('colleges.csv'));
    expect(colleges.names.length).toBeGreaterThan(250);
    expect(new Set(colleges.names).size).toBe(colleges.names.length);
    expect(colleges.weights.every(w => w > 0)).toBe(true);
  });
});
