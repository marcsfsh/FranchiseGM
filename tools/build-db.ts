// tools/build-db.ts: builds the embedded base database (spec 3.3, 6.8) and writes docs/MAPPING.md.
// The Vite build calls buildBaseDb() and embeds the result; run this file directly to refresh the
// mapping report:  npx tsx tools/build-db.ts
// Deterministic: the same inputs give byte-identical outputs.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { BASE_DB_VERSION, encodeBaseDb, type BaseDb, type BaseDbJson } from '../src/data/base-db';
import { parseClimate } from '../src/data/climate';
import { parseColleges, parseFirstNames, parseHometowns, parseSurnames } from '../src/data/names';
import { parseSchedule } from '../src/data/schedule';
import { TEAM_ABBRS } from '../src/data/team-colors';
import { generateTeamStaff } from '../src/engine/generate/staff';
import { stream } from '../src/engine/rng';
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

/** Seed for the default staff in the base database; fixed so builds are byte-identical. */
const DEFAULT_STAFF_SEED = 20260514;
export const SEASON = 2026;

/** Builds the base database from data-raw and the Madden CSV (or the fixture), plus the mapping report. */
export function buildBaseDb(root = ROOT): { db: BaseDb; json: BaseDbJson; mapping: string } {
  const raw = (name: string) => readFileSync(path.join(root, 'data-raw', name), 'utf8');
  const names = {
    first: parseFirstNames(raw('first-names.csv')),
    surnames: parseSurnames(raw('surnames.csv')),
    hometowns: parseHometowns(raw('hometowns.csv')),
    colleges: parseColleges(raw('colleges.csv'))
  };
  const { result, realData } = importRoster(root);
  const mapping = renderMappingReport(result.report, [
    renderFitSection(fitOverallByPosition(result), realData)
  ]);
  let n = 0;
  const staffCtx = {
    rng: stream(DEFAULT_STAFF_SEED, 'default-staff'),
    names,
    season: SEASON,
    usedNames: new Set(result.players.map(p => `${p.firstName} ${p.lastName}`)),
    newId: () => `s${++n}`
  };
  const db: BaseDb = {
    version: BASE_DB_VERSION,
    season: SEASON,
    source: realData ? 'madden' : 'fictional',
    schedule: parseSchedule(raw('schedule-2026.csv'), SEASON),
    climate: parseClimate(raw('climate.csv')),
    names,
    staff: TEAM_ABBRS.flatMap(team => generateTeamStaff(staffCtx, team)),
    // The fixture only tests the pipeline; fictional leagues generate their players at creation.
    players: realData ? result.players : []
  };
  return { db, json: encodeBaseDb(db), mapping };
}

/** Above this size the block is gzipped and base64-encoded (spec 6.8). */
export const GZIP_THRESHOLD = 2 * 1024 * 1024;

/** The `<script>` element that carries the database in game.html. */
export function baseDbScript(json: BaseDbJson): string {
  const text = JSON.stringify(json);
  if (text.length > GZIP_THRESHOLD) {
    const packed = gzipSync(Buffer.from(text, 'utf8'), { level: 9 }).toString('base64');
    return `<script type="application/json" id="base-db" data-encoding="gzip-base64">${packed}</script>`;
  }
  // Escaping < keeps the JSON from closing the script element early.
  return `<script type="application/json" id="base-db">${text.replaceAll('<', '\\u003c')}</script>`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { json, mapping } = buildBaseDb();
  writeFileSync(path.join(ROOT, 'docs/MAPPING.md'), mapping);
  const size = baseDbScript(json).length;
  console.log(
    `docs/MAPPING.md: ${mapping.split('\n').length} lines; base database: ${Math.round(size / 1024)} KB`
  );
}
