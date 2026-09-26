/**
 * Keeping the teams the AI runs legal to advance (D-46), the user's too when roster management is on auto:
 * within the active roster's limit, under the cap (restructuring the deals that save the most, then
 * releasing the least valuable players whose release saves), at the active roster's minimum (promoting from
 * the practice squad or signing free agents at the minimum where the roster is thinnest), and, in a week
 * the team plays, able to dress a legal game-day roster. Each takes the fixes the user is offered, in the
 * order a general manager would.
 */
import type { TeamAbbr } from '../../../data/team-colors';
import { capSheet } from '../../cap/sheet';
import type { League } from '../../league/types';
import type { Rng } from '../../rng';
import { fillFixes, gameDayFixes, releaseFixes, restructureFixes, type Fix } from '../../roster/fixes';
import { activeMinimum, gameDayProblem } from '../../roster/legality';
import { makeMove } from '../../roster/moves';
import { activeLimit, rosterCounts } from '../../roster/rules';
import { cutdown, keepValue } from './offseason';

/** Moves a team can need in one go: a roster's worth, and then some. */
const MOST_MOVES = 60;

/** Restructures, then releases the least valuable players whose release saves, until the team is under. */
export function getUnderCap(league: League, abbr: TeamAbbr, rng: Rng): void {
  for (let n = 0; n < MOST_MOVES && capSheet(league, abbr).space < 0; n++) {
    const restructure = restructureFixes(league, abbr)[0];
    const release = restructure
      ? undefined
      : releaseFixes(league, abbr).sort((a, b) => {
          const [pa, pb] = [league.players[a.move.playerId], league.players[b.move.playerId]];
          return (pa && pb ? keepValue(league, pa) - keepValue(league, pb) : 0) || (a.move.playerId < b.move.playerId ? -1 : 1);
        })[0]; // prettier-ignore
    const fix = restructure ?? release;
    if (!fix || !makeMove(league, fix.move, rng).ok) return;
  }
}

/**
 * Makes a fix, or when there's none because the cap has no room for one, frees room by restructuring the
 * deal that saves the most. False when neither can be done.
 */
function fixOrRoom(league: League, abbr: TeamAbbr, rng: Rng, fix: Fix | undefined): boolean {
  const move = fix?.move ?? restructureFixes(league, abbr)[0]?.move;
  return !!move && makeMove(league, move, rng).ok;
}

/** Fills the active roster to its minimum with practice squad players and free agents at the minimum. */
export function fillToMinimum(league: League, abbr: TeamAbbr, rng: Rng): void {
  const minimum = activeMinimum(league);
  for (let n = 0; n < MOST_MOVES && rosterCounts(league, abbr).active < minimum; n++)
    if (!fixOrRoom(league, abbr, rng, fillFixes(league, abbr, 1)[0])) return;
}

/** Elevates, signs, and opens spots until the team can dress a legal game-day roster this week. */
export function dressForGame(league: League, abbr: TeamAbbr, rng: Rng): void {
  for (let n = 0; n < MOST_MOVES && gameDayProblem(league, abbr); n++)
    if (!fixOrRoom(league, abbr, rng, gameDayFixes(league, abbr, 1)[0])) return;
}

/**
 * Everything a team needs to advance legally, in order: down to the roster limit (the least valuable players
 * go, as in the cutdown), under the cap, up to the minimum, and dressed for the week's game.
 */
export function makeLegal(league: League, abbr: TeamAbbr, rng: Rng): void {
  const limit = activeLimit(league);
  if (rosterCounts(league, abbr).active > limit) cutdown(league, abbr, rng, limit);
  getUnderCap(league, abbr, rng);
  fillToMinimum(league, abbr, rng);
  dressForGame(league, abbr, rng);
}
