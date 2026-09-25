import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ImportError,
  importMaddenCsv,
  parseHeight,
  parseMoney,
  renderMappingReport
} from '../../src/data/madden-import';
import { parseCsv } from '../../src/data/csv';
import { HAND_SET_FORMULAS, fitFormula } from '../../src/engine/ratings/overall';
import type { RatingKey } from '../../src/engine/model/ratings';

const OPTIONS = { minimumSalary: 885_000, maxYears: 7, season: 2026 };
const text = readFileSync('tests/fixtures/madden-fixture.csv', 'utf8');
const { players, report } = importMaddenCsv(text, 'tests/fixtures/madden-fixture.csv', OPTIONS);

describe('Madden CSV import (spec 6.9)', () => {
  it('lists every CSV column, mapped or kept as extra', () => {
    const headers = parseCsv(text).headers;
    expect(report.columns.map(c => c.header)).toEqual(headers);
    expect(report.columns.find(c => c.header === 'SPD')?.field).toBe('ratings.spd');
    expect(report.columns.find(c => c.header === 'Archetype')?.field).toBeNull();
    expect(players[0]?.extra.Archetype).toBe('QB fixture');
  });

  it('rejects rows missing required fields, with unknown positions, or duplicated', () => {
    expect(report.rows).toBe(211);
    expect(report.rejected.map(r => r.field).sort()).toEqual(['name', 'player', 'position']);
    expect(report.imported).toBe(211 - 3);
    for (const r of report.rejected) expect(r.reason.length).toBeGreaterThan(5);
  });

  it('fixes non-fatal problems with documented defaults', () => {
    const reasons = report.fixed.map(f => `${f.field}: ${f.reason}`);
    const has = (pattern: RegExp) =>
      expect(
        reasons.some(r => pattern.test(r)),
        pattern.source
      ).toBe(true);
    has(/ratings\.spd: 120 is outside 0 to 99; used 99/);
    has(/ratings\.agi: "abc" isn't a rating; used 50/);
    has(/jersey: #11 is taken/);
    has(/contract\.salary: .*below the minimum/);
    has(/contract\.years: 12 years is outside 1 to 7; used 7/);
    has(/team: Unknown team "Springfield Isotopes"/);
    has(/height: "tall" isn't a height/);
    has(/position: Mapped "RB" to HB/);
    // The unknown team's quarterback comes in as a free agent and keeps his number.
    expect(players.find(p => p.team === null && p.jersey === 7 && p.position === 'QB')).toBeDefined();
  });

  it('parses values into model units', () => {
    const first = players[0];
    expect(first?.team).toBe('ARI');
    expect(first?.height).toBeGreaterThanOrEqual(60);
    expect(first?.contract?.salary).toBeGreaterThan(0);
    expect(first?.traits.coversBall).toBeDefined();
    expect(
      players.every(p => Object.values(p.ratings).every(v => Number.isInteger(v) && v >= 0 && v <= 99))
    ).toBe(true);
    expect(parseMoney('$12.5M')).toBe(12_500_000);
    expect(parseMoney('850K')).toBe(850_000);
    expect(parseMoney('12,500,000')).toBe(12_500_000);
    expect(parseMoney('3.2')).toBe(3_200_000);
    expect(parseMoney('950')).toBe(950_000);
    expect(parseMoney('-5')).toBeNull();
    expect(parseHeight('6\'3"')).toBe(75);
    expect(parseHeight('6-3')).toBe(75);
    expect(parseHeight('75')).toBe(75);
    expect(parseHeight('tall')).toBeNull();
  });

  it('keeps one number per jersey on each team', () => {
    const byTeam = new Map<string, number[]>();
    for (const p of players)
      if (p.team && p.jersey !== null) byTeam.set(p.team, [...(byTeam.get(p.team) ?? []), p.jersey]);
    for (const [team, numbers] of byTeam) expect(new Set(numbers).size, team).toBe(numbers.length);
  });

  it('fails clearly when a required column is missing', () => {
    expect(() => importMaddenCsv('FirstName,LastName\nA,B\n', 'x.csv', OPTIONS)).toThrow(ImportError);
  });

  it('renders the mapping report with every column and the rejected rows', () => {
    const md = renderMappingReport(report);
    expect(md).toContain('Status: provisional');
    for (const c of report.columns) expect(md).toContain(`| ${c.header} |`);
    for (const r of report.rejected) expect(md).toContain(`| ${r.line} |`);
    expect(renderMappingReport(report)).toBe(md);
  });
});

describe('overall formula fit on the fixture (spec 7.1)', () => {
  it('recovers the fixture overall within a point for each sampled position', () => {
    for (const position of ['QB', 'WR', 'CB', 'LT', 'LE'] as const) {
      const samples = players
        .filter(p => p.position === position && p.maddenOvr !== null)
        .map(p => ({ ratings: p.ratings, ovr: p.maddenOvr as number }));
      const keys = Object.keys(HAND_SET_FORMULAS[position].coefficients) as RatingKey[];
      const fit = fitFormula(samples, keys);
      expect(fit.meanAbsError, position).toBeLessThan(1);
      expect(fit.within2, position).toBeGreaterThan(0.9);
    }
  });
});
