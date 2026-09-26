/**
 * Scouting (spec 10.4; D-43). Every team sees each prospect's scouting grade: his draft value as the
 * consensus misjudges it, plus the team's own error. Each week a team's scouts earn points in their regions
 * and its director of scouting anywhere; points spent on a prospect shrink the team's own error, see through
 * part of the consensus's, and reveal his traits and then his abilities. The director's accuracy and the
 * scouting accuracy setting scale every error. Teams on auto (every AI team, and the user's unless the user
 * takes scouting over) place their scouts and spend their points themselves.
 */
import { TEAM_ABBRS, type TeamAbbr } from '../../data/team-colors';
import { teamStaff } from '../league/fit';
import type { League } from '../league/types';
import type { StaffMember } from '../model/staff';
import { TUNING } from '../tuning';
import { draftValue, type DraftClass, type Prospect, type TeamScouting } from './class';

const S = TUNING.draft.scouting;

/** The director of scouting's points go anywhere. */
export const NATIONAL = 'National';
/** The regions scouts cover, which are the colleges' regions. */
export const REGIONS = ['Northeast', 'Southeast', 'South', 'Midwest', 'Southwest', 'West'] as const;

export interface Grade {
  /** The draft value the team sees. */
  value: number;
  /** The spread of its own error now, in points: what more scouting could still narrow. */
  spread: number;
  /** How far it has scouted him, from 0 to 1. */
  scouted: number;
}

/** How far a team has scouted a prospect, from 0 to 1. */
export const scoutedShare = (scouting: TeamScouting, id: string): number =>
  Math.min(1, (scouting.points[id] ?? 0) / S.fullPoints);

/** The size of a team's own error: its director of scouting's accuracy, and the setting. */
export function errorScale(league: League, team: TeamAbbr): number {
  const director = teamStaff(league, team).find(s => s.role === 'DOS');
  const accuracy = director?.ratings.accuracy ?? 50;
  return (1 - (S.directorEffect * (accuracy - 50)) / 50) / Math.max(0.1, league.settings.draft.scoutingAccuracy);
} // prettier-ignore

/** A team's grade on a prospect (spec 10.4); `scale` is the team's `errorScale`. */
export function gradeWith(draft: DraftClass, team: TeamAbbr, prospect: Prospect, scale: number): Grade {
  const scouted = scoutedShare(draft.scouting[team], prospect.player.id);
  const spread = S.teamSd * scale * (1 - S.pointsCut * scouted);
  const z = (prospect.noise[TEAM_ABBRS.indexOf(team)] ?? 0) / 100;
  const value =
    draftValue(prospect.player) + prospect.perception * (1 - S.consensusCut * scouted) + z * spread;
  return { value, spread, scouted };
}

/** Every prospect's grade for a team, by player ID. */
export function teamGrades(league: League, draft: DraftClass, team: TeamAbbr): Map<string, Grade> {
  const scale = errorScale(league, team);
  return new Map(draft.prospects.map(p => [p.player.id, gradeWith(draft, team, p, scale)]));
}

/** What a team has learned about a prospect beyond his grade. */
export function revealed(draft: DraftClass, team: TeamAbbr, id: string): { traits: boolean; abilities: boolean; personality: boolean } {
  const scouting = draft.scouting[team];
  const points = scouting.points[id] ?? 0;
  return { traits: points >= S.traitsAt, abilities: points >= S.abilitiesAt, personality: scouting.visits.includes(id) };
} // prettier-ignore

/** Points a staff member earns in a week, by his points rating. */
const weekly = (member: StaffMember, [low, high]: readonly [number, number]): number =>
  Math.round(low + ((high - low) * (member.ratings.points ?? 50)) / 99);

/** Whether a team's scouting runs itself: every AI team's, and the user's on auto. */
export const scoutsItself = (league: League, team: TeamAbbr): boolean =>
  team !== league.meta.start.userTeam || league.settings.auto.scouting;

/**
 * Places a team's scouts where its best-graded prospects are: the regions holding the most of its top
 * `S.placeFrom`, one scout to each, the scouts with the most points first.
 */
export function placeScouts(league: League, draft: DraftClass, team: TeamAbbr): void {
  const grades = teamGrades(league, draft, team);
  const top = [...draft.prospects].sort((a, b) => (grades.get(b.player.id)?.value ?? 0) - (grades.get(a.player.id)?.value ?? 0)).slice(0, S.placeFrom); // prettier-ignore
  const counts = new Map<string, number>(REGIONS.map(r => [r, 0]));
  for (const p of top) if (p.region) counts.set(p.region, (counts.get(p.region) ?? 0) + 1);
  const regions = [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([r]) => r);
  const scouts = teamStaff(league, team)
    .filter(s => s.role === 'SCOUT')
    .sort((a, b) => (b.ratings.points ?? 0) - (a.ratings.points ?? 0) || (a.id < b.id ? -1 : 1));
  scouts.forEach((s, i) => (s.region = regions[i % regions.length] ?? null));
}

/** The banks a prospect's scouting draws on: his region's, then the director's. */
const banksFor = (prospect: Prospect): string[] =>
  prospect.region ? [prospect.region, NATIONAL] : [NATIONAL];

/**
 * Spends up to `amount` of a team's points on a prospect, from his region's bank and then the director's,
 * never past a full workup. Returns the points spent.
 */
export function spendOn(draft: DraftClass, team: TeamAbbr, prospect: Prospect, amount: number): number {
  const scouting = draft.scouting[team];
  const id = prospect.player.id;
  let left = Math.min(amount, S.fullPoints - (scouting.points[id] ?? 0));
  let spent = 0;
  for (const bank of banksFor(prospect)) {
    const take = Math.min(left, scouting.bank[bank] ?? 0);
    if (take <= 0) continue;
    scouting.bank[bank] = (scouting.bank[bank] ?? 0) - take;
    left -= take;
    spent += take;
  }
  if (spent) scouting.points[id] = (scouting.points[id] ?? 0) + spent;
  return spent;
}

/** Spends a team's points on the prospects it grades highest that it hasn't finished, a little on each. */
function spendAuto(league: League, draft: DraftClass, team: TeamAbbr): void {
  const scouting = draft.scouting[team];
  const grades = teamGrades(league, draft, team);
  const order = [...draft.prospects].sort((a, b) => (grades.get(b.player.id)?.value ?? 0) - (grades.get(a.player.id)?.value ?? 0) || (a.player.id < b.player.id ? -1 : 1)); // prettier-ignore
  for (const p of order) {
    if (Object.values(scouting.bank).every(v => v < 1)) return;
    spendOn(draft, team, p, S.spendEach);
  }
}

/**
 * A week of scouting (spec 10.4): every team's scouts add points in their regions and its director in the
 * national bank, and the teams that scout themselves place their scouts and spend what they have.
 */
export function scoutWeek(league: League): void {
  const draft = league.draft;
  if (!draft) return;
  for (const team of TEAM_ABBRS) {
    const scouting = draft.scouting[team];
    const itself = scoutsItself(league, team);
    if (itself) placeScouts(league, draft, team);
    for (const member of teamStaff(league, team)) {
      const [bank, range] = member.role === 'DOS' ? [NATIONAL, S.directorPoints] : member.role === 'SCOUT' && member.region ? [member.region, S.scoutPoints] : [null, null]; // prettier-ignore
      if (bank && range) scouting.bank[bank] = (scouting.bank[bank] ?? 0) + weekly(member, range);
    }
    if (itself) spendAuto(league, draft, team);
  }
}
