// tools/build-db.ts: builds the embedded base database (spec 3.3, 6.8) and writes docs/MAPPING.md.
// The Vite build calls buildBaseDb() and embeds the result; run this file directly to refresh the
// mapping report:  npx tsx tools/build-db.ts
// Deterministic: the same inputs give byte-identical outputs.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { importMaddenCsv, renderMappingReport, type ImportResult } from '../src/data/madden-import';
import { POSITIONS } from '../src/engine/model/positions';
import type { RatingKey } from '../src/engine/model/ratings';
import { HAND_SET_FORMULAS, fitFormula } from '../src/engine/ratings/overall';
import { DEFAULT_RULES, minimumSalary } from '../src/engine/rules/ruleset';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MADDEN_CSV = 'data-raw/madden-roster.csv';
export const FIXTURE_CSV = 'tests/fixtures/madden-fixture.csv';

export interface FitRow {
  position: string;
  samples: number;
  meanAbsError: number | null;
  within2: number | null;
}

/** Imports the Madden CSV, or the synthetic fixture when the CSV hasn't arrived. */
export function importRoster(root = ROOT): { result: ImportResult; realData: boolean } {
  const realData = existsSync(path.join(root, MADDEN_CSV));
  const source = realData ? MADDEN_CSV : FIXTURE_CSV;
  const result = importMaddenCsv(readFileSync(path.join(root, source), 'utf8'), source, {
    minimumSalary: minimumSalary(DEFAULT_RULES, 0),
    maxYears: 7,
    season: 2026
  });
  return { result, realData };
}

/** Fits each position's overall formula against the imported OVR column (spec 7.1). */
export function fitOverallByPosition(result: ImportResult): FitRow[] {
  return POSITIONS.map(position => {
    const samples = result.players
      .filter(p => p.position === position && p.maddenOvr !== null)
      .map(p => ({ ratings: p.ratings, ovr: p.maddenOvr as number }));
    const keys = Object.keys(HAND_SET_FORMULAS[position].coefficients) as RatingKey[];
    if (samples.length <= keys.length + 1)
      return { position, samples: samples.length, meanAbsError: null, within2: null };
    const fit = fitFormula(samples, keys);
    return { position, samples: samples.length, meanAbsError: fit.meanAbsError, within2: fit.within2 };
  });
}

export function renderFitSection(rows: FitRow[], realData: boolean): string {
  const lines = [
    '## Overall formula fit by position',
    '',
    realData
      ? 'Least-squares fit of each position formula against Madden OVR.'
      : 'Fit against the fixture only. The check that formulas reproduce Madden OVR is deferred until the CSV arrives (docs/KNOWN-ISSUES.md).',
    '',
    '| Position | Samples | Mean abs error | Within 2 points |',
    '|---|---|---|---|'
  ];
  for (const r of rows) {
    lines.push(
      `| ${r.position} | ${r.samples} | ${r.meanAbsError === null ? 'too few samples' : r.meanAbsError.toFixed(2)} | ${
        r.within2 === null ? 'n/a' : `${Math.round(r.within2 * 100)}%`
      } |`
    );
  }
  return lines.join('\n');
}

export function buildMappingReport(root = ROOT): string {
  const { result, realData } = importRoster(root);
  return renderMappingReport(result.report, [renderFitSection(fitOverallByPosition(result), realData)]);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mapping = buildMappingReport();
  writeFileSync(path.join(ROOT, 'docs/MAPPING.md'), mapping);
  console.log(`docs/MAPPING.md: ${mapping.split('\n').length} lines`);
}
