/**
 * The salary floor (spec 11.1; D-33): as the CBA's club minimum cash spend, each team's cash spending over
 * consecutive windows of `salaryFloorYears` league years, counted from the league's first, must reach
 * `salaryFloorShare` of the caps over them. A team short of it pays the shortfall to its players.
 */
import { TEAM_ABBRS, type TeamAbbr } from '../../data/team-colors';
import { cashIn } from '../contracts/view';
import type { League } from '../league/types';
import { capFacts, teamContracts } from './sheet';

/** Cash a team paid in a league year, on every deal it signed or took on. */
export function teamCash(league: League, abbr: TeamAbbr, year: number): number {
  return teamContracts(league, abbr).reduce(
    (sum, c) => sum + cashIn(c, year, league.rules, capFacts(league, c.playerId)),
    0
  );
}

export interface FloorShortfall {
  team: TeamAbbr;
  /** The window's first and last league years. */
  from: number;
  to: number;
  spent: number;
  floor: number;
  shortfall: number;
}

/**
 * Closes league year `year` for the floor, before the next one opens: records each team's cash, and when the
 * year ends a window, checks the window against its caps and starts the next. Returns the teams short of it.
 */
export function closeFloorYear(league: League, year: number): FloorShortfall[] {
  const { salaryFloorShare: share, salaryFloorYears: years } = league.rules.cap;
  const ends = (year - league.meta.start.startSeason + 1) % years === 0;
  const caps = Array.from({ length: years }, (_, i) => league.caps[year - i] ?? 0).reduce((a, b) => a + b, 0);
  const short: FloorShortfall[] = [];
  for (const abbr of TEAM_ABBRS) {
    const team = league.teams[abbr];
    team.spending.push({ year, cash: teamCash(league, abbr, year) });
    if (!ends) continue;
    const spent = team.spending.filter(s => s.year > year - years).reduce((sum, s) => sum + s.cash, 0);
    const floor = Math.round(share * caps);
    if (spent < floor) short.push({ team: abbr, from: year - years + 1, to: year, spent, floor, shortfall: floor - spent });
    team.spending = [];
  }
  return short;
} // prettier-ignore
