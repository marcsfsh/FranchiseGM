/**
 * Who decides and how (spec 12.2, 14.3, 14.5): a head coach's depth chart style as a weighted profile, and
 * the staff members whose competence sets how sharply each weekly decision picks.
 */
import type { TeamAbbr } from '../../data/team-colors';
import { teamStaff } from '../league/fit';
import type { League } from '../league/types';
import type { StaffMember, StaffRole } from '../model/staff';
import { TUNING } from '../tuning';

const D = TUNING.ai.depth;

/**
 * A head coach's depth chart style as shares that add up to 1 (spec 12.2): the meritocrat starts the best
 * role rating, the veteran-leaning coach trusts experience, the developer plays young high-potential
 * players, the loyalist keeps his starters, and the contract-minded coach plays the expensive players.
 */
export interface CoachProfile {
  meritocrat: number;
  veteran: number;
  developer: number;
  loyalist: number;
  contract: number;
}

/**
 * The profile from the coach's personality and tendencies: analytics lean makes a meritocrat, youth lean
 * splits veteran from developer, loyalty and rigidity make a loyalist, and a coach with little personnel
 * power plays the players the front office paid.
 */
export function coachProfile(hc: StaffMember | undefined): CoachProfile {
  const t = hc?.tendencies;
  const p = hc?.personality ?? {};
  const youth = t?.youthLean ?? 50;
  const loyal = ((p.loyalty ?? 50) + (t?.rigidity ?? 50)) / 2;
  const raw: CoachProfile = {
    meritocrat: D.meritBase + (p.analyticsLean ?? 50) / 100,
    veteran: Math.max(0, 50 - youth) / 50,
    developer: Math.max(0, youth - 50) / 50,
    loyalist: Math.max(0, loyal - D.loyalFrom) / (100 - D.loyalFrom),
    contract: Math.max(0, D.contractFrom - (t?.personnelPower ?? 50)) / D.contractFrom
  };
  const total = raw.meritocrat + raw.veteran + raw.developer + raw.loyalist + raw.contract;
  return {
    meritocrat: raw.meritocrat / total,
    veteran: raw.veteran / total,
    developer: raw.developer / total,
    loyalist: raw.loyalist / total,
    contract: raw.contract / total
  };
}

/** The team's staff member in a role, if the job is filled. */
export const staffIn = (league: League, abbr: TeamAbbr, role: StaffRole): StaffMember | undefined =>
  teamStaff(league, abbr).find(s => s.role === role);

/** Competence (spec 14.5) for a decision: a rating from the member who makes it, 50 when the job is open. */
export const competence = (member: StaffMember | undefined, rating?: string): number =>
  member ? (rating ? (member.ratings[rating] ?? member.overall) : member.overall) : 50;
