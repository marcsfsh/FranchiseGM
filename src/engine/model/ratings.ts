/**
 * Player ratings (spec 6.3): Madden's rating set is canonical so imports are lossless. Every rating is an
 * integer 0 to 99. Keys are Madden's abbreviations in lower case; final CSV names are confirmed in
 * docs/MAPPING.md when the Madden file arrives.
 */

export const RATING_KEYS = [
  // Physical
  'spd', 'acc', 'agi', 'cod', 'str', 'jmp', 'sta', 'inj', 'tgh',
  // Mental
  'awr', 'prc',
  // Ball carrier
  'car', 'bcv', 'btk', 'trk', 'sfa', 'spm', 'jkm',
  // Receiving
  'cth', 'cit', 'spc', 'rls', 'srr', 'mrr', 'drr',
  // Blocking
  'rbk', 'rbp', 'rbf', 'pbk', 'pbp', 'pbf', 'ibl', 'lbk',
  // Passing
  'thp', 'sac', 'mac', 'dac', 'tor', 'tup', 'pac', 'bsk',
  // Defense
  'tak', 'pow', 'pur', 'bsh', 'fmv', 'pmv', 'mcv', 'zcv', 'prs',
  // Special teams
  'kpw', 'kac', 'ret', 'lsp'
] as const; // prettier-ignore

export type RatingKey = (typeof RATING_KEYS)[number];
export type Ratings = Record<RatingKey, number>;

export const RATING_LABELS: Record<RatingKey, string> = {
  spd: 'Speed', acc: 'Acceleration', agi: 'Agility', cod: 'Change of direction', str: 'Strength',
  jmp: 'Jumping', sta: 'Stamina', inj: 'Injury', tgh: 'Toughness', awr: 'Awareness', prc: 'Play recognition',
  car: 'Carrying', bcv: 'Ball carrier vision', btk: 'Break tackle', trk: 'Trucking', sfa: 'Stiff arm',
  spm: 'Spin move', jkm: 'Juke move', cth: 'Catching', cit: 'Catch in traffic', spc: 'Spectacular catch',
  rls: 'Release', srr: 'Short route running', mrr: 'Medium route running', drr: 'Deep route running',
  rbk: 'Run block', rbp: 'Run block power', rbf: 'Run block finesse', pbk: 'Pass block',
  pbp: 'Pass block power', pbf: 'Pass block finesse', ibl: 'Impact blocking', lbk: 'Lead block',
  thp: 'Throw power', sac: 'Short accuracy', mac: 'Medium accuracy', dac: 'Deep accuracy',
  tor: 'Throw on the run', tup: 'Throw under pressure', pac: 'Play action', bsk: 'Break sack', tak: 'Tackle',
  pow: 'Hit power', pur: 'Pursuit', bsh: 'Block shedding', fmv: 'Finesse moves', pmv: 'Power moves',
  mcv: 'Man coverage', zcv: 'Zone coverage', prs: 'Press', kpw: 'Kick power', kac: 'Kick accuracy',
  ret: 'Kick return', lsp: 'Long snap'
}; // prettier-ignore

export const RATING_GROUPS: Record<string, readonly RatingKey[]> = {
  Physical: ['spd', 'acc', 'agi', 'cod', 'str', 'jmp', 'sta', 'inj', 'tgh'],
  Mental: ['awr', 'prc'],
  'Ball carrier': ['car', 'bcv', 'btk', 'trk', 'sfa', 'spm', 'jkm'],
  Receiving: ['cth', 'cit', 'spc', 'rls', 'srr', 'mrr', 'drr'],
  Blocking: ['rbk', 'rbp', 'rbf', 'pbk', 'pbp', 'pbf', 'ibl', 'lbk'],
  Passing: ['thp', 'sac', 'mac', 'dac', 'tor', 'tup', 'pac', 'bsk'],
  Defense: ['tak', 'pow', 'pur', 'bsh', 'fmv', 'pmv', 'mcv', 'zcv', 'prs'],
  'Special teams': ['kpw', 'kac', 'ret', 'lsp']
};

/** Clamps and rounds to a valid rating. */
export const clampRating = (value: number): number => Math.max(0, Math.min(99, Math.round(value)));

export function isValidRating(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 99;
}

export function emptyRatings(value = 0): Ratings {
  return Object.fromEntries(RATING_KEYS.map(k => [k, value])) as Ratings;
}
