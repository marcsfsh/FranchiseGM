/**
 * The 32 franchises (spec 6.2): identity, conference and division, palette (style guide 2.6), and home
 * stadium. League state (owner, staff, finances, history) lives in the save, not here.
 */
import { TEAM_ABBRS, TEAM_COLORS, type Conference, type Division, type TeamAbbr } from './team-colors';
import { venueById, type Venue } from './stadiums';

export type { Conference, Division, TeamAbbr };

export interface TeamInfo {
  abbr: TeamAbbr;
  city: string;
  name: string;
  conf: Conference;
  div: Division;
  primary: string;
  accent: string;
  stadium: string;
}

const SHARED_STADIUM: Partial<Record<TeamAbbr, string>> = {
  LAR: 'SOFI',
  LAC: 'SOFI',
  NYG: 'METL',
  NYJ: 'METL'
};

export const TEAMS: readonly TeamInfo[] = TEAM_ABBRS.map(abbr => ({
  abbr,
  ...TEAM_COLORS[abbr],
  stadium: SHARED_STADIUM[abbr] ?? abbr
}));

const BY_ABBR = new Map(TEAMS.map(team => [team.abbr, team]));

export function team(abbr: TeamAbbr): TeamInfo {
  return BY_ABBR.get(abbr) as TeamInfo;
}

export function homeStadium(abbr: TeamAbbr): Venue {
  return venueById(team(abbr).stadium);
}

export const divisionKey = (t: TeamInfo): string => `${t.conf} ${t.div}`;

/** Teams in the same division, in abbreviation order. */
export function divisionOf(abbr: TeamAbbr): TeamAbbr[] {
  const key = divisionKey(team(abbr));
  return TEAMS.filter(t => divisionKey(t) === key).map(t => t.abbr);
}

export const DIVISIONS: readonly string[] = [...new Set(TEAMS.map(divisionKey))].sort();
