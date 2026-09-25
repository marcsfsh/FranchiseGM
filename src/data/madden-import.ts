/**
 * Madden CSV import (spec 6.9): maps columns through the declarative mapping, applies transforms,
 * validates, fixes non-fatal problems with documented defaults, and reports everything for
 * docs/MAPPING.md. Pure: text in, records and a report out.
 */
import { parseCsv } from './csv';
import { lookupTeam } from './team-lookup';
import type { TeamAbbr } from './team-colors';
import {
  MADDEN_MAPPING,
  MAPPING_STATUS,
  POSITION_ALIASES,
  TRAIT_ENUMS,
  headerKey,
  type FieldMapping
} from './madden-mapping';
import { isPosition, type Position } from '../engine/model/positions';
import { RATING_KEYS, emptyRatings, type RatingKey, type Ratings } from '../engine/model/ratings';
import { DEV_TRAITS, type DevTrait } from '../engine/model/player';
import type { Traits } from '../engine/model/traits';
import { freeJersey, jerseyAllowed } from '../engine/model/jerseys';

export interface ImportedContract {
  years: number;
  yearsLeft: number;
  /** Average annual salary, dollars. */
  salary: number;
  signingBonus: number;
}

export interface ImportedPlayer {
  /** Line in the CSV, for reports. */
  line: number;
  firstName: string;
  lastName: string;
  position: Position;
  team: TeamAbbr | null;
  jersey: number | null;
  age: number | null;
  birthDate: string | null;
  height: number | null;
  weight: number | null;
  college: string;
  handedness: 'R' | 'L';
  experience: number | null;
  /** Madden's own overall, kept for fitting the overall formulas. */
  maddenOvr: number | null;
  dev: DevTrait;
  ratings: Ratings;
  traits: Partial<Traits>;
  abilities: string[];
  contract: ImportedContract | null;
  extra: Record<string, string>;
}

export interface ImportIssue {
  line: number;
  field: string;
  reason: string;
}

export interface ColumnReport {
  header: string;
  field: string | null;
  transform: string;
}

export interface ImportReport {
  status: typeof MAPPING_STATUS;
  source: string;
  rows: number;
  imported: number;
  columns: ColumnReport[];
  /** Mapped fields with no column in the file, with the default the import used. */
  missing: { field: string; fallback: string; required: boolean }[];
  rejected: ImportIssue[];
  fixed: ImportIssue[];
  teamCounts: Record<string, number>;
}

export interface ImportOptions {
  /** Minimum salary used when a contract salary is missing or too low. */
  minimumSalary: number;
  /** Maximum contract length in years. */
  maxYears: number;
  /** League year the file describes, for deriving birth dates from ages. */
  season: number;
}

export class ImportError extends Error {}

const MONEY = /^\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*([KkMm]?)$/;

/** Dollars from "$12.5M", "850K", "12,500,000", or a bare number (see docs/MAPPING.md for the rule). */
export function parseMoney(text: string): number | null {
  const m = MONEY.exec(text.trim());
  if (!m) return null;
  const value = Number((m[1] as string).replaceAll(',', ''));
  const unit = (m[2] as string).toUpperCase();
  if (unit === 'M') return Math.round(value * 1_000_000);
  if (unit === 'K') return Math.round(value * 1_000);
  if (value >= 100_000) return Math.round(value);
  if (value < 100) return Math.round(value * 1_000_000);
  return Math.round(value * 1_000);
}

/** Inches from 6'3", 6-3, 6 3, 6ft 3in, or plain inches. */
export function parseHeight(text: string): number | null {
  const t = text.trim();
  const feet = /^(\d)\s*(?:'|ft|-|\s)\s*(\d{1,2})\s*(?:"|in|'')?$/i.exec(t);
  const inches = feet ? Number(feet[1]) * 12 + Number(feet[2]) : /^\d{2}$/.test(t) ? Number(t) : NaN;
  return inches >= 60 && inches <= 90 ? inches : null;
}

const BOOL: Record<string, boolean> = {
  yes: true,
  y: true,
  true: true,
  '1': true,
  no: false,
  n: false,
  false: false,
  '0': false
};

const DEFAULTS = { age: 26, height: 74, weight: 245 };

export function importMaddenCsv(text: string, source: string, options: ImportOptions): ImportResult {
  const table = parseCsv(text);
  const byKey = new Map<string, string>();
  for (const header of table.headers) if (!byKey.has(headerKey(header))) byKey.set(headerKey(header), header);

  // Resolve each mapped field to a header.
  const resolved = new Map<FieldMapping, string>();
  const used = new Set<string>();
  for (const mapping of MADDEN_MAPPING) {
    const header = mapping.aliases
      .map(a => byKey.get(headerKey(a)))
      .find(h => h !== undefined && !used.has(h));
    if (header) {
      resolved.set(mapping, header);
      used.add(header);
    }
  }
  const missing = MADDEN_MAPPING.filter(m => !resolved.has(m)).map(m => ({
    field: m.field,
    fallback: m.fallback,
    required: m.required === true
  }));
  const missingRequired = missing.filter(m => m.required);
  // A full-name column can stand in for first and last names.
  const fullNameHeader = byKey.get('fullname') ?? byKey.get('name') ?? byKey.get('player');
  if (missingRequired.some(m => m.field === 'position') || (missingRequired.length && !fullNameHeader)) {
    throw new ImportError(
      `The CSV is missing required columns: ${missingRequired.map(m => m.field).join(', ')}`
    );
  }
  if (fullNameHeader) used.add(fullNameHeader);

  const columns: ColumnReport[] = table.headers.map(header => {
    const mapping = [...resolved].find(([, h]) => h === header)?.[0];
    if (mapping) return { header, field: mapping.field, transform: mapping.transform };
    if (header === fullNameHeader) return { header, field: 'firstName + lastName', transform: 'split name' };
    return { header, field: null, transform: `kept as extra.${header}` };
  });

  const rejected: ImportIssue[] = [];
  const fixed: ImportIssue[] = [];
  const players: ImportedPlayer[] = [];
  const seen = new Set<string>();

  table.rows.forEach((row, index) => {
    const line = table.lines[index] as number;
    const get = (field: string): string | undefined => {
      const mapping = MADDEN_MAPPING.find(m => m.field === field);
      const header = mapping && resolved.get(mapping);
      return header === undefined ? undefined : (row[header] ?? '').trim();
    };
    const fix = (field: string, reason: string) => fixed.push({ line, field, reason });

    let firstName = get('firstName') ?? '';
    let lastName = get('lastName') ?? '';
    if ((!firstName || !lastName) && fullNameHeader) {
      const parts = (row[fullNameHeader] ?? '').trim().split(/\s+/);
      if (parts.length >= 2) {
        firstName ||= parts[0] as string;
        lastName ||= parts.slice(1).join(' ');
      }
    }
    if (!firstName || !lastName) {
      rejected.push({ line, field: 'name', reason: 'Missing first or last name.' });
      return;
    }
    const rawPosition = (get('position') ?? '').toUpperCase();
    const position = isPosition(rawPosition) ? rawPosition : POSITION_ALIASES[rawPosition];
    if (!position || !isPosition(position)) {
      rejected.push({ line, field: 'position', reason: `Unknown position "${rawPosition}".` });
      return;
    }
    if (position !== rawPosition) fix('position', `Mapped "${rawPosition}" to ${position}.`);

    const rawTeam = get('team') ?? '';
    let team = lookupTeam(rawTeam);
    if (team === undefined) {
      fix('team', `Unknown team "${rawTeam}"; imported as a free agent.`);
      team = null;
    }

    const int = (field: string): number | null => {
      const value = get(field);
      if (value === undefined || value === '') return null;
      const n = Number(value);
      if (!Number.isInteger(n)) {
        fix(field, `"${value}" isn't a whole number; used the default.`);
        return null;
      }
      return n;
    };

    const age = int('age');
    const ratings = emptyRatings();
    for (const key of RATING_KEYS) {
      const value = get(`ratings.${key}`);
      const fallback = key === 'lsp' ? 0 : 50;
      if (value === undefined) {
        ratings[key] = fallback;
        continue;
      }
      const n = Number(value);
      if (value === '' || !Number.isFinite(n)) {
        fix(`ratings.${key}`, `"${value}" isn't a rating; used ${fallback}.`);
        ratings[key] = fallback;
      } else if (n < 0 || n > 99 || !Number.isInteger(n)) {
        const clamped = Math.max(0, Math.min(99, Math.round(n)));
        fix(`ratings.${key}`, `${value} is outside 0 to 99; used ${clamped}.`);
        ratings[key] = clamped;
      } else ratings[key as RatingKey] = n;
    }

    const ovrText = get('ovr');
    const ovrNumber = ovrText === undefined || ovrText === '' ? null : Number(ovrText);
    const maddenOvr =
      ovrNumber !== null && Number.isInteger(ovrNumber) && ovrNumber >= 0 && ovrNumber <= 99
        ? ovrNumber
        : null;
    if (ovrText && maddenOvr === null) fix('ovr', `"${ovrText}" isn't a valid overall; ignored.`);

    const heightText = get('height');
    const height = heightText ? parseHeight(heightText) : null;
    if (heightText && height === null)
      fix('height', `"${heightText}" isn't a height; used the position default.`);

    const devText = get('dev') ?? '';
    const dev = DEV_TRAITS.find(d => headerKey(d) === headerKey(devText)) ?? 'Normal';
    if (devText && headerKey(dev) !== headerKey(devText))
      fix('dev', `Unknown development trait "${devText}"; used Normal.`);

    const traits: Partial<Traits> = {};
    for (const mapping of MADDEN_MAPPING.filter(m => m.field.startsWith('traits.'))) {
      const value = get(mapping.field);
      if (value === undefined || value === '') continue;
      const key = mapping.field.slice(7) as keyof Traits;
      if (mapping.transform === 'bool') {
        const b = BOOL[value.toLowerCase()];
        if (b === undefined) fix(mapping.field, `"${value}" isn't yes or no; the trait will be generated.`);
        else (traits as Record<string, unknown>)[key] = b;
      } else {
        const table = TRAIT_ENUMS[mapping.transform.slice(5) as keyof typeof TRAIT_ENUMS] as Record<
          string,
          string
        >;
        const match = Object.entries(table).find(([k]) => headerKey(k) === headerKey(value))?.[1];
        if (match === undefined) fix(mapping.field, `Unknown value "${value}"; the trait will be generated.`);
        else (traits as Record<string, unknown>)[key] = match;
      }
    }

    let contract: ImportedContract | null = null;
    const yearsText = get('contract.years');
    const salaryText = get('contract.salary');
    if ((yearsText && yearsText !== '0') || salaryText) {
      let years = int('contract.years') ?? 1;
      if (years < 1 || years > options.maxYears) {
        const clamped = Math.max(1, Math.min(options.maxYears, years));
        fix('contract.years', `${years} years is outside 1 to ${options.maxYears}; used ${clamped}.`);
        years = clamped;
      }
      let yearsLeft = int('contract.yearsLeft') ?? years;
      if (yearsLeft < 1 || yearsLeft > years) {
        fix('contract.yearsLeft', `${yearsLeft} years left doesn't fit a ${years}-year deal; used ${years}.`);
        yearsLeft = years;
      }
      let salary = salaryText ? parseMoney(salaryText) : null;
      if (salary === null || salary < options.minimumSalary) {
        fix(
          'contract.salary',
          `Salary "${salaryText ?? ''}" is missing or below the minimum; used the minimum.`
        );
        salary = options.minimumSalary;
      }
      const bonusText = get('contract.bonus');
      let signingBonus = bonusText ? parseMoney(bonusText) : 0;
      if (signingBonus === null) {
        fix('contract.bonus', `"${bonusText}" isn't an amount; used 0.`);
        signingBonus = 0;
      }
      contract = { years, yearsLeft, salary, signingBonus };
    }

    const identity = `${headerKey(firstName)}|${headerKey(lastName)}|${position}|${team ?? 'FA'}|${age ?? ''}`;
    if (seen.has(identity)) {
      rejected.push({
        line,
        field: 'player',
        reason: `Duplicate of an earlier row for ${firstName} ${lastName}.`
      });
      return;
    }
    seen.add(identity);

    const extra: Record<string, string> = {};
    for (const header of table.headers)
      if (!used.has(header) && row[header]) extra[header] = row[header] as string;

    const birthText = get('birthDate');
    const birthDate = birthText && /^\d{4}-\d{2}-\d{2}$/.test(birthText) ? birthText : null;
    if (birthText && !birthDate) fix('birthDate', `"${birthText}" isn't YYYY-MM-DD; derived from age.`);

    const hand = (get('handedness') ?? '').toLowerCase();
    players.push({
      line,
      firstName,
      lastName,
      position,
      team,
      jersey: int('jersey'),
      age,
      birthDate,
      height,
      weight: int('weight'),
      college: get('college') ?? '',
      handedness: hand.startsWith('l') ? 'L' : 'R',
      experience: int('experience'),
      maddenOvr,
      dev,
      ratings,
      traits,
      abilities: (get('abilities') ?? '')
        .split(/[;|]/)
        .map(s => s.trim())
        .filter(Boolean),
      contract,
      extra
    });
  });

  // Jersey conflicts and invalid numbers: keep the first holder, give later ones the next free number.
  const taken = new Map<string, Set<number>>();
  for (const p of players) {
    if (!p.team) continue;
    const numbers = taken.get(p.team) ?? new Set<number>();
    taken.set(p.team, numbers);
    if (p.jersey !== null && jerseyAllowed(p.position, p.jersey) && !numbers.has(p.jersey)) {
      numbers.add(p.jersey);
      continue;
    }
    const next = freeJersey(p.position, numbers);
    fixed.push({
      line: p.line,
      field: 'jersey',
      reason:
        p.jersey === null
          ? `No jersey number; assigned ${next ?? 'none'}.`
          : `#${p.jersey} is taken or not allowed for a ${p.position}; assigned ${next ?? 'none'}.`
    });
    p.jersey = next;
    if (next !== null) numbers.add(next);
  }
  for (const p of players) {
    p.age ??= DEFAULTS.age;
    p.height ??= DEFAULTS.height;
    p.weight ??= DEFAULTS.weight;
    p.experience ??= Math.max(0, p.age - 22);
    p.birthDate ??= `${options.season - p.age}-07-01`;
  }

  const teamCounts: Record<string, number> = {};
  for (const p of players)
    teamCounts[p.team ?? 'Free agents'] = (teamCounts[p.team ?? 'Free agents'] ?? 0) + 1;

  return {
    players,
    report: {
      status: MAPPING_STATUS,
      source,
      rows: table.rows.length,
      imported: players.length,
      columns,
      missing,
      rejected,
      fixed,
      teamCounts
    }
  };
}

export interface ImportResult {
  players: ImportedPlayer[];
  report: ImportReport;
}

/** Renders the report as docs/MAPPING.md. Deterministic: no dates or machine details. */
export function renderMappingReport(report: ImportReport, extraSections: string[] = []): string {
  const lines: string[] = [];
  const esc = (text: string) => text.replaceAll('|', '\\|');
  lines.push('# Madden CSV mapping', '');
  lines.push('Generated by `tools/build-db.ts` from `src/data/madden-mapping.ts`. Do not edit by hand.', '');
  lines.push(
    report.status === 'provisional'
      ? `**Status: provisional.** The real Madden roster CSV hasn't arrived. This report comes from the synthetic fixture \`${report.source}\`, and every header below is a placeholder to confirm against the real file.`
      : `**Status: confirmed** against \`${report.source}\`.`,
    ''
  );
  lines.push(
    `Rows read: ${report.rows}. Imported: ${report.imported}. Rejected: ${report.rejected.length}. Values fixed: ${report.fixed.length}.`,
    ''
  );
  lines.push('## Columns', '', '| CSV column | Maps to | Transform |', '|---|---|---|');
  for (const c of report.columns)
    lines.push(`| ${esc(c.header)} | ${c.field ?? 'not mapped'} | ${esc(c.transform)} |`);
  lines.push('', '## Mapped fields missing from the file', '');
  if (report.missing.length === 0) lines.push('None.');
  else {
    lines.push('| Field | Default used |', '|---|---|');
    for (const m of report.missing) lines.push(`| ${m.field} | ${esc(m.fallback)} |`);
  }
  lines.push('', '## Value transforms', '');
  lines.push(
    '- Money: "$12.5M" and "850K" use their unit. Bare numbers of 100,000 or more are dollars, under 100 are millions, and anything between is thousands.',
    '- Height: 6\'3", 6-3, 6 3, and 6ft 3in, or plain inches from 60 to 90.',
    '- Positions: ' +
      Object.entries(POSITION_ALIASES)
        .map(([k, v]) => `${k} to ${v}`)
        .join(', ') +
      '. Ambiguous positions take the left side.',
    '- Teams: abbreviations, full names, nicknames, and unique city names. "FA", "Free Agent", and blank are free agents.',
    '- Ratings: whole numbers 0 to 99. Out-of-range values are clamped and non-numbers use the field default.',
    '- Jerseys: a number taken on the same team, or not allowed for the position, gets the next free allowed number.',
    '- Contracts: length clamped to 1 to 7 years; a salary below the league minimum becomes the minimum.',
    '- Unmapped columns are kept on each player as `extra.<column>`.'
  );
  lines.push('', '## Rejected rows', '');
  if (report.rejected.length === 0) lines.push('None.');
  else {
    lines.push('| Line | Reason |', '|---|---|');
    for (const r of report.rejected) lines.push(`| ${r.line} | ${esc(r.reason)} |`);
  }
  lines.push('', '## Fixed values', '');
  if (report.fixed.length === 0) lines.push('None.');
  else {
    lines.push('| Line | Field | Fix |', '|---|---|---|');
    for (const f of report.fixed.slice(0, 300)) lines.push(`| ${f.line} | ${f.field} | ${esc(f.reason)} |`);
    if (report.fixed.length > 300) lines.push('', `${report.fixed.length - 300} more fixes are not listed.`);
  }
  lines.push('', '## Players per team', '', '| Team | Players |', '|---|---|');
  for (const [team, count] of Object.entries(report.teamCounts).sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`| ${team} | ${count} |`);
  }
  for (const section of extraSections) lines.push('', section.trimEnd());
  return lines.join('\n') + '\n';
}
