/**
 * Team palette inputs from style guide 2.6 and 13.2. This map is the palette source for the whole game;
 * derived UI primaries and Night surfaces are computed (src/app/theme/tokens.ts), never stored.
 * Brand metadata stays separate from computed UI values.
 */

export type Conference = 'AFC' | 'NFC';
export type Division = 'East' | 'North' | 'South' | 'West';

export interface TeamPalette {
  city: string;
  name: string;
  conf: Conference;
  div: Division;
  primary: string;
  accent: string;
}

export const TEAM_COLORS = {
  ARI: {
    city: 'Arizona',
    name: 'Cardinals',
    conf: 'NFC',
    div: 'West',
    primary: '#97233F',
    accent: '#FFB612'
  },
  ATL: { city: 'Atlanta', name: 'Falcons', conf: 'NFC', div: 'South', primary: '#A71930', accent: '#A5ACAF' },
  BAL: {
    city: 'Baltimore',
    name: 'Ravens',
    conf: 'AFC',
    div: 'North',
    primary: '#241773',
    accent: '#9E7C0C'
  },
  BUF: { city: 'Buffalo', name: 'Bills', conf: 'AFC', div: 'East', primary: '#00338D', accent: '#C60C30' },
  CAR: {
    city: 'Carolina',
    name: 'Panthers',
    conf: 'NFC',
    div: 'South',
    primary: '#101820',
    accent: '#0085CA'
  },
  CHI: { city: 'Chicago', name: 'Bears', conf: 'NFC', div: 'North', primary: '#0B162A', accent: '#C83803' },
  CIN: {
    city: 'Cincinnati',
    name: 'Bengals',
    conf: 'AFC',
    div: 'North',
    primary: '#000000',
    accent: '#FB4F14'
  },
  CLE: {
    city: 'Cleveland',
    name: 'Browns',
    conf: 'AFC',
    div: 'North',
    primary: '#311D00',
    accent: '#FF3C00'
  },
  DAL: { city: 'Dallas', name: 'Cowboys', conf: 'NFC', div: 'East', primary: '#003594', accent: '#869397' },
  DEN: { city: 'Denver', name: 'Broncos', conf: 'AFC', div: 'West', primary: '#002244', accent: '#FB4F14' },
  DET: { city: 'Detroit', name: 'Lions', conf: 'NFC', div: 'North', primary: '#0076B6', accent: '#B0B7BC' },
  GB: {
    city: 'Green Bay',
    name: 'Packers',
    conf: 'NFC',
    div: 'North',
    primary: '#203731',
    accent: '#FFB612'
  },
  HOU: { city: 'Houston', name: 'Texans', conf: 'AFC', div: 'South', primary: '#03202F', accent: '#A71930' },
  IND: {
    city: 'Indianapolis',
    name: 'Colts',
    conf: 'AFC',
    div: 'South',
    primary: '#002C5F',
    accent: '#A2AAAD'
  },
  JAX: {
    city: 'Jacksonville',
    name: 'Jaguars',
    conf: 'AFC',
    div: 'South',
    primary: '#006778',
    accent: '#D7A22A'
  },
  KC: {
    city: 'Kansas City',
    name: 'Chiefs',
    conf: 'AFC',
    div: 'West',
    primary: '#E31837',
    accent: '#FFB81C'
  },
  LAC: {
    city: 'Los Angeles',
    name: 'Chargers',
    conf: 'AFC',
    div: 'West',
    primary: '#0080C6',
    accent: '#FFC20E'
  },
  LAR: { city: 'Los Angeles', name: 'Rams', conf: 'NFC', div: 'West', primary: '#003594', accent: '#FFD100' },
  LV: { city: 'Las Vegas', name: 'Raiders', conf: 'AFC', div: 'West', primary: '#000000', accent: '#A5ACAF' },
  MIA: { city: 'Miami', name: 'Dolphins', conf: 'AFC', div: 'East', primary: '#008E97', accent: '#FC4C02' },
  MIN: {
    city: 'Minnesota',
    name: 'Vikings',
    conf: 'NFC',
    div: 'North',
    primary: '#4F2683',
    accent: '#FFC62F'
  },
  NE: {
    city: 'New England',
    name: 'Patriots',
    conf: 'AFC',
    div: 'East',
    primary: '#002244',
    accent: '#C60C30'
  },
  NO: {
    city: 'New Orleans',
    name: 'Saints',
    conf: 'NFC',
    div: 'South',
    primary: '#101820',
    accent: '#D3BC8D'
  },
  NYG: { city: 'New York', name: 'Giants', conf: 'NFC', div: 'East', primary: '#0B2265', accent: '#A71930' },
  NYJ: { city: 'New York', name: 'Jets', conf: 'AFC', div: 'East', primary: '#125740', accent: '#8FB8A8' },
  PHI: {
    city: 'Philadelphia',
    name: 'Eagles',
    conf: 'NFC',
    div: 'East',
    primary: '#004C54',
    accent: '#A5ACAF'
  },
  PIT: {
    city: 'Pittsburgh',
    name: 'Steelers',
    conf: 'AFC',
    div: 'North',
    primary: '#101820',
    accent: '#FFB612'
  },
  SEA: { city: 'Seattle', name: 'Seahawks', conf: 'NFC', div: 'West', primary: '#002244', accent: '#69BE28' },
  SF: {
    city: 'San Francisco',
    name: '49ers',
    conf: 'NFC',
    div: 'West',
    primary: '#AA0000',
    accent: '#B3995D'
  },
  TB: {
    city: 'Tampa Bay',
    name: 'Buccaneers',
    conf: 'NFC',
    div: 'South',
    primary: '#D50A0A',
    accent: '#FF7900'
  },
  TEN: {
    city: 'Tennessee',
    name: 'Titans',
    conf: 'AFC',
    div: 'South',
    primary: '#0C2340',
    accent: '#4B92DB'
  },
  WAS: {
    city: 'Washington',
    name: 'Commanders',
    conf: 'NFC',
    div: 'East',
    primary: '#5A1414',
    accent: '#FFB612'
  }
} as const satisfies Record<string, TeamPalette>;

export type TeamAbbr = keyof typeof TEAM_COLORS;

export const TEAM_ABBRS = Object.keys(TEAM_COLORS).sort() as TeamAbbr[];

export function isTeamAbbr(value: unknown): value is TeamAbbr {
  return typeof value === 'string' && Object.hasOwn(TEAM_COLORS, value);
}

export const teamFullName = (abbr: TeamAbbr): string => `${TEAM_COLORS[abbr].city} ${TEAM_COLORS[abbr].name}`;
