/** Fit for a team inside a league (spec 7.7): its schemes, the league's fit cap, and its staff. */
import type { TeamAbbr } from '../../data/team-colors';
import { teamFitContext } from '../fit/cohesion';
import type { FitContext } from '../fit/role-rating';
import type { StaffMember } from '../model/staff';
import type { League } from './types';

export function teamStaff(league: League, abbr: TeamAbbr): StaffMember[] {
  return Object.values(league.teams[abbr].staff)
    .flat()
    .flatMap(id => (id && league.staff[id] ? [league.staff[id]] : []));
}

export function leagueFitContext(league: League, abbr: TeamAbbr): FitContext {
  return teamFitContext(league.teams[abbr].schemes, league.settings.fitCap, teamStaff(league, abbr));
}
