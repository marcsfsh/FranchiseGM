// tools/make-madden-fixture.ts: writes tests/fixtures/madden-fixture.csv, a synthetic Madden-style roster
// with provisional headers (spec 6.9, build order "Starting without the Madden CSV"). Deterministic.
// Overall is a known linear function of the hand-set formulas, so the fitter test can recover it.
//   npx tsx tools/make-madden-fixture.ts
import { writeFileSync } from 'node:fs';
import { Rng } from '../src/engine/rng';
import { RATING_KEYS, clampRating, emptyRatings, type Ratings } from '../src/engine/model/ratings';
import type { Position } from '../src/engine/model/positions';
import { HAND_SET_FORMULAS, formulaValue } from '../src/engine/ratings/overall';
import { TEAM_ABBRS, teamFullName } from '../src/data/team-colors';

/** The fixture's overall: 1.12 x the hand-set formula minus 7, plus a little noise. */
export const FIXTURE_SCALE = 1.12;
export const FIXTURE_SHIFT = -7;

const FIRST = [
  'Avery',
  'Brandt',
  'Caleb',
  'Dorian',
  'Emeka',
  'Felix',
  'Gideon',
  'Hollis',
  'Isaiah',
  'Jalen',
  'Kofi',
  'Luca',
  'Marcus',
  'Nils',
  'Oren',
  'Pierce'
];
const LAST = [
  'Abernathy',
  'Bello',
  'Castillo',
  'Dunmore',
  'Ekwueme',
  'Fairley',
  'Gates',
  'Hale',
  'Ibarra',
  'Jennings',
  'Kowalski',
  'Lindqvist',
  'Mbeki',
  'Nakamura',
  'Okafor',
  "O'Dell",
  'Pryor-Vance',
  'Åberg'
];
const COLLEGES = ['Alabama', 'Ohio State', 'Georgia', 'Iowa', 'North Dakota State', 'Toledo', 'Utah', 'LSU'];
const SLOTS: Position[] = ['QB', 'WR', 'WR', 'CB', 'LT', 'LE'];
const JERSEY: Record<string, number[]> = {
  QB: [5, 12],
  WR: [11, 81],
  CB: [24, 31],
  LT: [71, 76],
  LE: [91, 95]
};
const TRAITS = [
  'QBStyle',
  'SensePressure',
  'ThrowAway',
  'TightSpiral',
  'ForcesPasses',
  'CoversBall',
  'FightForYards',
  'HighMotor',
  'BigHitter',
  'PlaysBall',
  'Penalty',
  'Clutch',
  'LBStyle'
];
const HEADERS = [
  'FirstName', 'LastName', 'Position', 'Team', 'JerseyNum', 'Age', 'Height', 'Weight', 'College', 'Handedness',
  'YearsPro', 'OVR', 'DevTrait', ...RATING_KEYS.map(k => k.toUpperCase()), ...TRAITS,
  'ContractLength', 'ContractYearsLeft', 'ContractSalary', 'ContractBonus', 'Archetype', 'PortraitID', 'Abilities'
]; // prettier-ignore

const rng = new Rng(20260501);
const usedNames = new Set<string>();

/** A first and last name no other fixture row uses, so validation only rejects the deliberate bad rows. */
function uniqueName(): [string, string] {
  for (;;) {
    const name: [string, string] = [rng.pick(FIRST), rng.pick(LAST)];
    if (!usedNames.has(name.join(' '))) {
      usedNames.add(name.join(' '));
      return name;
    }
  }
}
const cell = (v: string | number) =>
  /[",]/.test(String(v)) ? `"${String(v).replaceAll('"', '""')}"` : String(v);

function ratingsFor(position: Position): Ratings {
  const r = emptyRatings();
  const keys = new Set(Object.keys(HAND_SET_FORMULAS[position].coefficients));
  for (const k of RATING_KEYS) r[k] = clampRating(keys.has(k) ? rng.normal(72, 9) : rng.normal(45, 12));
  return r;
}

function row(
  position: Position,
  team: string,
  jersey: number,
  overrides: Record<string, string> = {}
): string[] {
  const ratings = ratingsFor(position);
  const ovr = clampRating(
    FIXTURE_SCALE * formulaValue(HAND_SET_FORMULAS[position], ratings) + FIXTURE_SHIFT + rng.normal(0, 0.5)
  );
  const age = rng.int(22, 34);
  const heightIn = position === 'LT' || position === 'LE' ? rng.int(76, 80) : rng.int(70, 76);
  const values: Record<string, string | number> = {
    FirstName: uniqueName()[0],
    LastName: '',
    Position: position,
    Team: team,
    JerseyNum: jersey,
    Age: age,
    Height: `${Math.floor(heightIn / 12)}'${heightIn % 12}"`,
    Weight: position === 'LT' ? rng.int(305, 335) : position === 'LE' ? rng.int(260, 285) : rng.int(190, 225),
    College: rng.pick(COLLEGES),
    Handedness: rng.chance(0.1) ? 'Left' : 'Right',
    YearsPro: Math.max(0, age - 22 - rng.int(0, 1)),
    OVR: ovr,
    DevTrait: rng.weighted(['Normal', 'Star', 'Superstar', 'X-Factor'], [70, 20, 8, 2]),
    ...Object.fromEntries(RATING_KEYS.map(k => [k.toUpperCase(), ratings[k]])),
    QBStyle: position === 'QB' ? rng.pick(['Pocket', 'Balanced', 'Scrambling']) : '',
    SensePressure: position === 'QB' ? rng.pick(['Ideal', 'Average', 'Trigger Happy', 'Paranoid']) : '',
    ThrowAway: position === 'QB' ? rng.pick(['Yes', 'No']) : '',
    TightSpiral: position === 'QB' ? rng.pick(['Yes', 'No']) : '',
    ForcesPasses: position === 'QB' ? rng.pick(['Conservative', 'Ideal', 'Aggressive']) : '',
    CoversBall: rng.pick(['Never', 'On Big Hits', 'On Medium Hits', 'For All Hits', 'Always']),
    FightForYards: rng.pick(['Yes', 'No']),
    HighMotor: rng.pick(['Yes', 'No']),
    BigHitter: rng.pick(['Yes', 'No']),
    PlaysBall: rng.pick(['Conservative', 'Balanced', 'Aggressive']),
    Penalty: rng.pick(['Disciplined', 'Normal', 'Undisciplined']),
    Clutch: rng.pick(['Yes', 'No']),
    LBStyle: '',
    ContractLength: rng.int(1, 5),
    ContractYearsLeft: 1,
    ContractSalary: `$${(rng.int(9, 400) / 10).toFixed(1)}M`,
    ContractBonus: `${rng.int(0, 20000)}K`,
    Archetype: `${position} fixture`,
    PortraitID: rng.int(1000, 9999),
    Abilities: ''
  };
  values.ContractYearsLeft = rng.int(1, Number(values.ContractLength));
  values.LastName = [...usedNames].at(-1)?.split(' ').slice(1).join(' ') ?? '';
  Object.assign(values, overrides);
  return HEADERS.map(h => cell(values[h] ?? ''));
}

const rows: string[][] = [];
for (const abbr of TEAM_ABBRS) {
  const used: Record<string, number> = {};
  for (const position of SLOTS) {
    const n = used[position] ?? 0;
    used[position] = n + 1;
    rows.push(row(position, teamFullName(abbr), (JERSEY[position] as number[])[n] as number));
  }
}
for (const position of ['QB', 'WR', 'CB', 'LT', 'LE', 'WR', 'CB', 'QB'] as Position[])
  rows.push(row(position, 'Free Agent', 0));

// Deliberately bad rows for the validation tests.
rows.push(row('WR', 'Minnesota Vikings', 13, { FirstName: '' }));
rows.push(row('WR', 'Detroit Lions', 14, { Position: 'XYZ' }));
rows.push(row('CB', 'Chicago Bears', 20, { SPD: '120' }));
rows.push(row('CB', 'Green Bay Packers', 21, { AGI: 'abc' }));
rows.push(row('WR', 'Minnesota Vikings', 11));
rows.push([...(rows[0] as string[])]);
rows.push(row('LE', 'Seattle Seahawks', 97, { ContractSalary: '-5' }));
rows.push(row('LE', 'Denver Broncos', 98, { ContractLength: '12' }));
rows.push(row('QB', 'Springfield Isotopes', 7));
rows.push(row('LT', 'Buffalo Bills', 68, { Height: 'tall' }));
rows.push(row('HB', 'Atlanta Falcons', 28, { Position: 'RB' }));

const header = [
  '# Synthetic Madden-style roster for testing the import pipeline. Fictional players; provisional headers.',
  '# Written by tools/make-madden-fixture.ts. Do not edit by hand.'
];
writeFileSync(
  'tests/fixtures/madden-fixture.csv',
  [...header, HEADERS.join(','), ...rows.map(r => r.join(','))].join('\n') + '\n'
);
console.log(`tests/fixtures/madden-fixture.csv: ${rows.length} rows`);
