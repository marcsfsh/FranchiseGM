/**
 * Roster rules (spec 12.1): the active roster limit (53 from the final cutdown through the Super Bowl, 90
 * from then until the cutdown), the practice squad's size and its veteran limit, game-day elevations from
 * the practice squad, and the reserve lists, which don't count against the limit. Checks return problems in
 * words the UI can show; an empty list means the roster is legal.
 */
import type { TeamAbbr } from '../../data/team-colors';
import { capSheet } from '../cap/sheet';
import type { League } from '../league/types';
import type { GameDate, Phase } from '../model/calendar';
import type { Player } from '../model/player';
import { cannotPlay, designation } from '../season/injuries';
import { gameWeek } from '../season/state';
import { dollars, plural } from '../text';

/** Phases the offseason limit covers: after the Super Bowl through the preseason. */
const OFFSEASON: ReadonlySet<Phase> = new Set<Phase>([
  'staff', 'awards', 'resign', 'combine', 'annualMeeting', 'freeAgency', 'proDays', 'draft', 'udfa', 'otas',
  'trainingCamp', 'preseason'
]); // prettier-ignore

export const inOffseason = (date: GameDate): boolean => OFFSEASON.has(date.phase);

/** The active roster limit on the league's date. */
export const activeLimit = (league: League): number =>
  inOffseason(league.date) ? league.rules.roster.offseason : league.rules.roster.active;

/** Whether a practice squad player counts against the veteran limit: more than the allowed accrued seasons. */
export const practiceSquadVeteran = (league: League, player: Player): boolean =>
  player.accrued > league.rules.roster.practiceSquadVeteranSeasons;

const teamPlayers = (league: League, abbr: TeamAbbr): Player[] =>
  Object.values(league.players).filter(p => p.team === abbr);

/** Practice squad players the team has elevated for this week's game. */
export function elevatedThisWeek(league: League, abbr: TeamAbbr): string[] {
  const week = gameWeek(league);
  return league.season.elevations.filter(e => e.team === abbr && e.week === week).map(e => e.playerId);
}

/** Times a player has been elevated this season. */
export const elevationsThisSeason = (league: League, playerId: string): number =>
  league.season.elevations.filter(e => e.playerId === playerId).length;

/** Whether a practice squad player is elevated for this week's game, so he can dress for it. */
export const isElevated = (league: League, player: Player): boolean =>
  player.status === 'practice' &&
  player.team !== null &&
  elevatedThisWeek(league, player.team).includes(player.id);

/**
 * Players who can dress this week before any rest decision: active or elevated from the practice squad,
 * and not held out by an injury.
 */
export const dressable = (league: League, abbr: TeamAbbr): Player[] =>
  Object.values(league.players).filter(
    p =>
      p.team === abbr &&
      (p.status === 'active' || isElevated(league, p)) &&
      !cannotPlay(designation(p.injury))
  );

export interface RosterCounts {
  active: number;
  limit: number;
  practice: number;
  practiceVeterans: number;
  /** Injured reserve, PUP, NFI, suspended, and did not report: none count against the limit. */
  reserve: number;
  elevated: number;
}

export function rosterCounts(league: League, abbr: TeamAbbr): RosterCounts {
  const players = teamPlayers(league, abbr);
  const practice = players.filter(p => p.status === 'practice');
  return {
    active: players.filter(p => p.status === 'active').length,
    limit: activeLimit(league),
    practice: practice.length,
    practiceVeterans: practice.filter(p => practiceSquadVeteran(league, p)).length,
    reserve: players.filter(p => ['ir', 'pup', 'nfi', 'suspended', 'holdout'].includes(p.status)).length,
    elevated: elevatedThisWeek(league, abbr).length
  };
}

/** What's wrong with a team's roster on the league's date (spec 12.1, 11.1); empty when it's legal. */
export function rosterProblems(league: League, abbr: TeamAbbr): string[] {
  const r = league.rules.roster;
  const counts = rosterCounts(league, abbr);
  const problems: string[] = [];
  if (counts.active > counts.limit)
    problems.push(`${plural(counts.active, 'player')} on the active roster; the limit is ${counts.limit}.`);
  if (counts.practice > r.practiceSquad)
    problems.push(
      `${plural(counts.practice, 'player')} on the practice squad; the limit is ${r.practiceSquad}.`
    );
  if (counts.practiceVeterans > r.practiceSquadVeterans)
    problems.push(
      `${plural(counts.practiceVeterans, 'veteran')} on the practice squad; at most ${r.practiceSquadVeterans} may have more than ${plural(r.practiceSquadVeteranSeasons, 'accrued season')}.`
    );
  if (counts.elevated > r.elevationsPerGame)
    problems.push(
      `${plural(counts.elevated, 'player')} elevated this week; the limit is ${r.elevationsPerGame}.`
    );
  for (const id of elevatedThisWeek(league, abbr))
    if (elevationsThisSeason(league, id) > r.elevationsPerPlayer)
      problems.push(`A player was elevated more than ${plural(r.elevationsPerPlayer, 'time')} this season.`);
  const sheet = capSheet(league, abbr);
  if (sheet.space < 0) problems.push(`${dollars(-sheet.space)} over the cap.`);
  return problems;
}
