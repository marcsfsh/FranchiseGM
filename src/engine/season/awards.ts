/**
 * Players of the week (spec 18.4): the best offensive, defensive, and special teams game in each conference,
 * by a game score built from the box score, and the rookie of the week, the best game by a first-year player
 * in the league. A player on a winning team gets a small edge, as voters give.
 */
import { team, type Conference, type TeamAbbr } from '../../data/teams';
import type { PlayerLine } from '../sim/stats';
import type { GameResult } from '../sim/types';
import { joinList, plural } from '../text';
import { TUNING } from '../tuning';

const A = TUNING.awards;

/** The phases a game is scored in. */
export type GameCategory = 'offense' | 'defense' | 'special';
export type AwardCategory = GameCategory | 'rookie';
const GAME_CATEGORIES: readonly GameCategory[] = ['offense', 'defense', 'special'];

export interface WeeklyAward {
  season: number;
  week: number;
  /** The conference the award is for; the rookie award is league-wide and names the player's conference. */
  conference: Conference;
  category: AwardCategory;
  playerId: string;
  team: TeamAbbr;
  /** The game in words, such as "27 of 35 for 342 yards and 3 touchdowns". */
  line: string;
  score: number;
}

const AWARD_WORDS = { offense: 'Offensive', defense: 'Defensive', special: 'Special Teams' } as const;

/** The award's name, such as "NFC Defensive Player of the Week" or "Rookie of the Week". */
export const awardName = (a: WeeklyAward): string =>
  a.category === 'rookie'
    ? 'Rookie of the Week'
    : `${a.conference} ${AWARD_WORDS[a.category]} Player of the Week`;

const weighted = (line: PlayerLine, weights: Readonly<Partial<Record<keyof PlayerLine, number>>>): number =>
  Object.entries(weights).reduce((n, [key, w]) => n + (line[key as keyof PlayerLine] ?? 0) * (w ?? 0), 0);

/** Game scores by category. */
export const gameScore: Record<GameCategory, (line: PlayerLine) => number> = {
  offense: line => weighted(line, A.offense),
  defense: line => weighted(line, A.defense),
  special: line => weighted(line, A.special) - (line.fgAtt - line.fgMade) * A.missedKick
};

/** The game in words: the category's headline numbers. */
export function lineText(category: GameCategory, l: PlayerLine): string {
  if (category === 'offense') {
    const parts: string[] = [];
    if (l.passAtt >= 10) {
      parts.push(`${l.passCmp} of ${l.passAtt} for ${plural(l.passYds, 'yard')}`);
      if (l.passTd) parts.push(plural(l.passTd, 'touchdown pass', 'touchdown passes'));
    }
    if (l.rushAtt >= 5 || l.rushTd)
      parts.push(`${plural(l.rushAtt, 'carry', 'carries')} for ${plural(l.rushYds, 'yard')}`);
    if (l.receptions >= 3 || l.recTd)
      parts.push(`${plural(l.receptions, 'catch', 'catches')} for ${plural(l.recYds, 'yard')}`);
    const scores = l.rushTd + l.recTd;
    if (scores) parts.push(plural(scores, 'touchdown'));
    return joinList(parts.slice(0, 3));
  }
  if (category === 'defense') {
    const parts = [
      l.sacks ? plural(l.sacks, 'sack') : '',
      l.defInt ? plural(l.defInt, 'interception') : '',
      l.forcedFumbles ? plural(l.forcedFumbles, 'forced fumble') : '',
      l.defIntTd + l.fumbleReturnTd ? plural(l.defIntTd + l.fumbleReturnTd, 'defensive touchdown') : '',
      l.tackles ? plural(l.tackles, 'tackle') : ''
    ].filter(Boolean);
    return joinList(parts.slice(0, 3));
  }
  const parts = [
    l.fgAtt ? `${l.fgMade} of ${plural(l.fgAtt, 'field goal')}${l.fgLong ? `, long ${l.fgLong}` : ''}` : '',
    l.kickReturnTd ? plural(l.kickReturnTd, 'kickoff return touchdown') : '',
    l.puntReturnTd ? plural(l.puntReturnTd, 'punt return touchdown') : '',
    l.kickReturnYds + l.puntReturnYds >= 100 ? `${l.kickReturnYds + l.puntReturnYds} return yards` : '',
    l.puntsIn20 ? `${plural(l.puntsIn20, 'punt')} inside the 20` : ''
  ].filter(Boolean);
  return joinList(parts.slice(0, 2));
}

/**
 * The week's players of the week, three per conference, then the rookie of the week when `rookies` names
 * any first-year players, from its finished games.
 */
export function playersOfTheWeek(
  season: number,
  week: number,
  results: readonly GameResult[],
  rookies: ReadonlySet<string> = new Set()
): WeeklyAward[] {
  const awards: WeeklyAward[] = [];
  const better = (score: number, playerId: string, best: WeeklyAward | null) =>
    score > 0 && (!best || score > best.score || (score === best.score && playerId < best.playerId));
  const games = results.flatMap(result =>
    (['home', 'away'] as const).map(side => ({
      abbr: result[side],
      won: result.score[side] > result.score[side === 'home' ? 'away' : 'home'],
      players: Object.entries(result.box[side].players)
    }))
  );
  for (const conference of ['AFC', 'NFC'] as const) {
    for (const category of GAME_CATEGORIES) {
      let best: WeeklyAward | null = null;
      for (const { abbr, won, players } of games) {
        if (team(abbr).conf !== conference) continue;
        for (const [playerId, line] of players) {
          const score = gameScore[category](line) * (won ? A.winnerEdge : 1);
          if (better(score, playerId, best))
            best = { season, week, conference, category, playerId, team: abbr, line: lineText(category, line), score };
        }
      }
      if (best) awards.push(best);
    }
  }
  let rookie: WeeklyAward | null = null;
  for (const { abbr, won, players } of games)
    for (const [playerId, line] of players) {
      if (!rookies.has(playerId)) continue;
      for (const category of GAME_CATEGORIES) {
        const score = gameScore[category](line) * (won ? A.winnerEdge : 1);
        if (better(score, playerId, rookie))
          rookie = { season, week, conference: team(abbr).conf, category: 'rookie', playerId, team: abbr, line: lineText(category, line), score };
      }
    }
  if (rookie) awards.push(rookie);
  return awards;
} // prettier-ignore
