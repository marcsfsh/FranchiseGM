/**
 * Declarative mapping from Madden CSV headers to model fields (spec 6.9).
 *
 * PROVISIONAL: the real Madden file hasn't arrived, so headers are placeholders modeled on common
 * Madden exports. Each field lists aliases, matched without regard to case, spaces, or punctuation, so
 * both abbreviated (SPD) and spelled-out (Speed) exports map. When the CSV arrives, confirm the headers
 * here and rerun the import; docs/MAPPING.md is regenerated from this file.
 */
import { RATING_KEYS, RATING_LABELS, type RatingKey } from '../engine/model/ratings';
import {
  COVERS_BALL,
  FORCES_PASSES,
  LB_STYLES,
  PENALTY,
  PLAYS_BALL,
  QB_STYLES,
  SENSE_PRESSURE,
  type Traits
} from '../engine/model/traits';

export const MAPPING_STATUS: 'provisional' | 'confirmed' = 'provisional';

export type Transform =
  | 'text'
  | 'int'
  | 'rating'
  | 'height'
  | 'money'
  | 'position'
  | 'team'
  | 'devTrait'
  | 'handedness'
  | 'bool'
  | 'date'
  | 'list'
  | `enum:${keyof typeof TRAIT_ENUMS}`;

export interface FieldMapping {
  /** Dotted model field, such as `ratings.spd` or `contract.salary`. */
  field: string;
  aliases: readonly string[];
  transform: Transform;
  /** A row missing this field is rejected. */
  required?: boolean;
  /** What the import uses when the value is missing or bad (documented in docs/MAPPING.md). */
  fallback: string;
}

/** Trait enums: Madden spellings on the left, model values on the right. */
export const TRAIT_ENUMS = {
  qbStyle: Object.fromEntries(QB_STYLES.map(v => [v, v])),
  sensePressure: {
    ...Object.fromEntries(SENSE_PRESSURE.map(v => [v, v])),
    'trigger happy': 'triggerHappy'
  },
  forcesPasses: Object.fromEntries(FORCES_PASSES.map(v => [v, v])),
  coversBall: {
    ...Object.fromEntries(COVERS_BALL.map(v => [v, v])),
    'on big hits': 'onBigHits',
    'on medium hits': 'onMediumHits',
    'for all hits': 'forAllHits'
  },
  playsBall: Object.fromEntries(PLAYS_BALL.map(v => [v, v])),
  penalty: Object.fromEntries(PENALTY.map(v => [v, v])),
  lbStyle: {
    ...Object.fromEntries(LB_STYLES.map(v => [v, v])),
    'pass rush': 'passRush',
    'pass rusher': 'passRush'
  }
} as const satisfies Record<string, Record<string, string>>;

/** Position spellings. Ambiguous ones take the left side; depth charts can move them later. */
export const POSITION_ALIASES: Record<string, string> = {
  RB: 'HB',
  HB: 'HB',
  OT: 'LT',
  T: 'LT',
  OG: 'LG',
  G: 'LG',
  DE: 'LE',
  EDGE: 'LE',
  LEDG: 'LE',
  REDG: 'RE',
  NT: 'DT',
  DL: 'DT',
  OLB: 'LOLB',
  ILB: 'MLB',
  LB: 'MLB',
  MIKE: 'MLB',
  S: 'SS',
  DB: 'CB',
  PK: 'K'
};

const TRAIT_FIELDS: readonly [keyof Traits, readonly string[], Transform][] = [
  ['qbStyle', ['QBStyle', 'QB Style'], 'enum:qbStyle'],
  ['sensePressure', ['SensePressure', 'Sense Pressure'], 'enum:sensePressure'],
  ['throwAway', ['ThrowAway', 'Throw Away'], 'bool'],
  ['tightSpiral', ['TightSpiral', 'Tight Spiral'], 'bool'],
  ['forcesPasses', ['ForcesPasses', 'Forces Passes'], 'enum:forcesPasses'],
  ['coversBall', ['CoversBall', 'Covers Ball'], 'enum:coversBall'],
  ['fightForYards', ['FightForYards', 'Fight For Yards'], 'bool'],
  ['feetInBounds', ['FeetInBounds', 'Feet In Bounds'], 'bool'],
  ['dropsOpenPasses', ['DropsOpenPasses', 'Drops Open Passes'], 'bool'],
  ['possessionCatch', ['PossessionCatch', 'Possession Catch'], 'bool'],
  ['aggressiveCatch', ['AggressiveCatch', 'Aggressive Catch'], 'bool'],
  ['yacCatch', ['YACCatch', 'YAC Catch', 'RAC Catch', 'RACCatch'], 'bool'],
  ['highMotor', ['HighMotor', 'High Motor'], 'bool'],
  ['bigHitter', ['BigHitter', 'Big Hitter'], 'bool'],
  ['stripsBall', ['StripsBall', 'Strips Ball'], 'bool'],
  ['playsBall', ['PlaysBall', 'Plays Ball'], 'enum:playsBall'],
  ['penalty', ['Penalty'], 'enum:penalty'],
  ['clutch', ['Clutch'], 'bool'],
  ['predictable', ['Predictable'], 'bool'],
  ['dlSwim', ['DLSwim', 'DL Swim'], 'bool'],
  ['dlSpin', ['DLSpin', 'DL Spin'], 'bool'],
  ['dlBullRush', ['DLBullRush', 'DL Bull Rush'], 'bool'],
  ['lbStyle', ['LBStyle', 'LB Style'], 'enum:lbStyle']
];

export const MADDEN_MAPPING: readonly FieldMapping[] = [
  { field: 'firstName', aliases: ['FirstName', 'First Name'], transform: 'text', required: true, fallback: 'row rejected' },
  { field: 'lastName', aliases: ['LastName', 'Last Name'], transform: 'text', required: true, fallback: 'row rejected' },
  { field: 'position', aliases: ['Position', 'Pos'], transform: 'position', required: true, fallback: 'row rejected' },
  { field: 'team', aliases: ['Team', 'Team Name', 'Club'], transform: 'team', fallback: 'free agent' },
  { field: 'jersey', aliases: ['JerseyNum', 'Jersey Number', 'Jersey', 'Number'], transform: 'int', fallback: 'next free number for the position' },
  { field: 'age', aliases: ['Age'], transform: 'int', fallback: 'position median age' },
  { field: 'birthDate', aliases: ['Birthdate', 'Birth Date', 'DOB'], transform: 'date', fallback: 'derived from age' },
  { field: 'height', aliases: ['Height', 'HGT'], transform: 'height', fallback: 'position median height' },
  { field: 'weight', aliases: ['Weight', 'WGT'], transform: 'int', fallback: 'position median weight' },
  { field: 'college', aliases: ['College', 'School'], transform: 'text', fallback: 'blank' },
  { field: 'handedness', aliases: ['Handedness', 'Hand', 'Throws'], transform: 'handedness', fallback: 'right' },
  { field: 'experience', aliases: ['YearsPro', 'Years Pro', 'Experience', 'EXP'], transform: 'int', fallback: 'age minus 22, at least 0' },
  { field: 'ovr', aliases: ['OVR', 'Overall', 'Overall Rating'], transform: 'rating', fallback: 'computed from the overall formula' },
  { field: 'dev', aliases: ['DevTrait', 'Dev Trait', 'Development', 'Development Trait'], transform: 'devTrait', fallback: 'Normal' },
  { field: 'abilities', aliases: ['Abilities', 'Superstar Abilities', 'X-Factor Abilities'], transform: 'list', fallback: 'none' },
  ...RATING_KEYS.map(
    (key: RatingKey): FieldMapping => ({
      field: `ratings.${key}`,
      aliases: [key.toUpperCase(), RATING_LABELS[key]],
      transform: 'rating',
      fallback: key === 'lsp' ? '0 (long snap is often absent)' : '50'
    })
  ),
  ...TRAIT_FIELDS.map(
    ([key, aliases, transform]): FieldMapping => ({ field: `traits.${key}`, aliases, transform, fallback: 'generated from ratings' })
  ),
  { field: 'contract.years', aliases: ['ContractLength', 'Contract Length', 'Contract Years'], transform: 'int', fallback: '1 year' },
  { field: 'contract.yearsLeft', aliases: ['ContractYearsLeft', 'Contract Years Left', 'Years Left'], transform: 'int', fallback: 'contract length' },
  { field: 'contract.salary', aliases: ['ContractSalary', 'Salary', 'Annual Salary'], transform: 'money', fallback: 'league minimum' },
  { field: 'contract.bonus', aliases: ['ContractBonus', 'Signing Bonus', 'Bonus'], transform: 'money', fallback: '0' }
]; // prettier-ignore

/** Normalizes a header or alias for matching: lower case, letters and digits only. */
export const headerKey = (header: string): string => header.toLowerCase().replace(/[^a-z0-9]/g, '');
