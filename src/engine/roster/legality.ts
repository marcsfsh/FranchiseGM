/**
 * Legal rosters before an advance (D-46): under the cap, within the active roster's minimum and limit, and,
 * in a week the team plays, able to dress a legal game-day roster. The user's team is checked before every
 * advance unless the league's rule enforcement is off, and the AI keeps every team it runs legal the same
 * way. The League health card lists every team's problems.
 */
import { TEAM_ABBRS, type TeamAbbr } from '../../data/team-colors';
import { capSheet } from '../cap/sheet';
import type { League } from '../league/types';
import { POSITION_GROUP, type Position } from '../model/positions';
import { weekGames } from '../season/state';
import { dollars, joinList, plural } from '../text';
import { dressable, inOffseason, rosterCounts } from './rules';

export type ProblemKind = 'cap' | 'limit' | 'minimum' | 'gameDay';

export interface LegalityProblem {
  kind: ProblemKind;
  /** The problem as a fact about the team: "$5.0M over the 2027 cap". */
  fact: string;
  /** What's wrong and how to fix it, to the user. */
  text: string;
  /** How far off: dollars over the cap, or players over the limit or short of the minimum. */
  amount: number;
  /** For a game-day roster: what it lacks. */
  gameDay?: GameDayShort;
}

/** What a team lacks to dress a legal game-day roster. */
export interface GameDayShort {
  /** Positions with nobody healthy to dress. */
  missing: Position[];
  /** Healthy offensive linemen short of a line. */
  line: number;
}

/** The positions a game-day roster needs one of, besides its line (D-46). */
export const GAME_DAY_NEEDS: readonly Position[] = ['QB', 'K', 'P', 'LS'];

const POSITION_WORDS: Partial<Record<Position, string>> = {
  QB: 'quarterback',
  K: 'kicker',
  P: 'punter',
  LS: 'long snapper'
};

/** The fewest players the active roster may carry on the league's date: the minimum outside the offseason. */
export const activeMinimum = (league: League): number =>
  inOffseason(league.date) ? 0 : league.rules.roster.activeMin;

/** Whether a team plays a game in the week the league is in. */
export const playsThisWeek = (league: League, abbr: TeamAbbr): boolean =>
  weekGames(league).some(g => g.home === abbr || g.away === abbr);

/**
 * What a team lacks to dress a legal game-day roster this week (D-46): a quarterback, kicker, punter, and
 * long snapper, and a line of offensive linemen, healthy and not resting. The count it dresses (48 with 8
 * offensive linemen, otherwise 47, fewer when injuries leave fewer) has no minimum, as in the NFL. Null
 * when it can, or has no game.
 */
export function gameDayProblem(league: League, abbr: TeamAbbr): LegalityProblem | null {
  if (!playsThisWeek(league, abbr)) return null;
  const r = league.rules.roster;
  // A questionable player the team rests doesn't dress.
  const resting = new Set(league.teams[abbr].resting);
  const players = dressable(league, abbr).filter(p => !resting.has(p.id));
  const count = (fits: (p: Position) => boolean) => players.filter(p => fits(p.position)).length;
  const missing = GAME_DAY_NEEDS.filter(position => count(p => p === position) === 0);
  const linemen = count(p => POSITION_GROUP[p] === 'OL');
  const short: GameDayShort = { missing, line: Math.max(0, r.gameDayLine - linemen) };
  const gaps = [
    ...missing.map(p => `no healthy ${POSITION_WORDS[p]}`),
    short.line ? `${plural(linemen, 'healthy offensive lineman', 'healthy offensive linemen')} of the ${r.gameDayLine} a line needs` : null
  ].filter((g): g is string => g !== null); // prettier-ignore
  if (!gaps.length) return null;
  return {
    kind: 'gameDay',
    fact: `Can't dress a game-day roster: ${joinList(gaps)}`,
    text: `You can't dress a legal game-day roster this week: ${joinList(gaps)}. Elevate or promote a practice squad player, sign a free agent, move an injured player to injured reserve to open a spot, or play a questionable player you're resting.`,
    amount: Math.max(short.line, missing.length),
    gameDay: short
  };
}

/** What stops a team's next advance (D-46); empty when it's legal. */
export function legalityProblems(league: League, abbr: TeamAbbr): LegalityProblem[] {
  const problems: LegalityProblem[] = [];
  const sheet = capSheet(league, abbr);
  if (sheet.space < 0) {
    const { phase, week } = league.date;
    const why =
      phase === 'freeAgency' && week === 1
        ? 'Teams must be under the cap when the league year opens: restructure or release'
        : phase === 'cutdown'
          ? 'From the final cutdown every contract counts: cut down to the limit, then restructure or release'
          : 'Teams must stay under the cap: restructure or release';
    problems.push({
      kind: 'cap',
      fact: `${dollars(-sheet.space)} over the ${sheet.year} cap`,
      text: `You're ${dollars(-sheet.space)} over the ${sheet.year} salary cap. ${why} contracts to get under before you advance.`,
      amount: -sheet.space
    });
  }
  const counts = rosterCounts(league, abbr);
  if (counts.active > counts.limit)
    problems.push({
      kind: 'limit',
      fact: `${plural(counts.active, 'active player')}, over the limit of ${counts.limit}`,
      text: `You have ${plural(counts.active, 'player')} on the active roster; the limit is ${counts.limit}. Release players or move injured ones to injured reserve before you advance.`,
      amount: counts.active - counts.limit
    });
  const minimum = activeMinimum(league);
  if (counts.active < minimum)
    problems.push({
      kind: 'minimum',
      fact: `${plural(counts.active, 'active player')}, short of the minimum of ${minimum}`,
      text: `You have ${plural(counts.active, 'player')} on the active roster; teams must carry ${minimum}. Sign free agents or promote practice squad players before you advance.`,
      amount: minimum - counts.active
    });
  const gameDay = gameDayProblem(league, abbr);
  if (gameDay) problems.push(gameDay);
  return problems;
}

/** Why the user's team can't advance (D-46), or null; nothing stops it with rule enforcement off. */
export function advanceBlock(league: League): string | null {
  if (!league.settings.commissioner.enforceRules) return null;
  const problems = legalityProblems(league, league.meta.start.userTeam);
  return problems.length ? problems.map(p => p.text).join(' ') : null;
}

/** Every team with a problem, for the League health card (post-M23 2.10.1). */
export function leagueHealth(league: League): { team: TeamAbbr; problems: LegalityProblem[] }[] {
  return TEAM_ABBRS.map(team => ({ team, problems: legalityProblems(league, team) })).filter(
    t => t.problems.length > 0
  );
}
