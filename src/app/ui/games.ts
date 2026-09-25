/**
 * Games as the schedule, the bracket, the team hub, and the inbox show them (spec 19.3): week labels, and
 * a game card with both teams, the score once it's played, and a link to the game page.
 */
import type { ScheduledGame } from '../../data/schedule';
import { TEAM_COLORS, type TeamAbbr } from '../../data/team-colors';
import type { League } from '../../engine/league/types';
import { PHASE_LABELS } from '../../engine/model/calendar';
import { PLAYOFF_PHASES } from '../../engine/season/state';
import { h, type Child } from '../dom';
import { gameDay, kickoff } from '../format';
import { href } from '../router';

/** A club's nickname: "Vikings". */
export const nick = (abbr: TeamAbbr): string => TEAM_COLORS[abbr].name;

/** "Week 5", or a playoff round's name. */
export function weekLabel(league: League, week: number): string {
  const weeks = league.rules.season.weeks;
  return week > weeks ? PHASE_LABELS[PLAYOFF_PHASES[week - weeks - 1] ?? 'wildCard'] : `Week ${week}`;
}

/** The scheduled game a result message is about: the user's game that week. */
export function userGameIn(league: League, season: number, week: number): ScheduledGame | undefined {
  const user = league.meta.start.userTeam;
  return league.schedule.find(
    g => g.season === season && g.week === week && (g.home === user || g.away === user)
  );
}

export interface GameCardOptions {
  /** A label above the teams, such as the week. */
  label?: string;
  /** Before the status: "AFC · ". */
  prefix?: string;
  /** Seeds to show before the nicknames in the playoffs. */
  seedOf?: (abbr: TeamAbbr) => number;
}

/**
 * A game card: the visitors above the home team, each with the score once played and the winner in bold,
 * then the status and a link to the game page (a box score once played, a preview before).
 */
export function gameCard(league: League, game: ScheduledGame, options: GameCardOptions = {}): HTMLElement {
  const user = league.meta.start.userTeam;
  const result = league.season.results[game.id];
  const side = (abbr: TeamAbbr, score: number | null, won: boolean): HTMLElement => {
    const seed = options.seedOf?.(abbr);
    return h(
      'div',
      { class: `game-team${won ? ' is-winner' : ''}${abbr === user ? ' is-us' : ''}` },
      h('span', null, `${seed ? `(${seed}) ` : ''}${nick(abbr)}`, abbr === user ? h('span', { class: 'sr-only' }, ' (your team)') : null),
      h('span', { class: 'num' }, score === null ? '' : String(score)),
      won ? h('span', { class: 'sr-only' }, ', won') : null
    );
  }; // prettier-ignore
  const status: Child[] = result
    ? [`${options.prefix ?? ''}Final${result.overtime ? ', overtime' : ''} · `]
    : [`${options.prefix ?? ''}${gameDay(game.date, game.day)} · ${kickoff(game.timeEt)} · `];
  // The link names its game for lists read out of context; the name starts with the visible words.
  const text = result ? 'Box score' : 'Preview';
  const link = h(
    'a',
    {
      href: href('game', { id: game.id }),
      'aria-label': `${text}: ${nick(game.away)} at ${nick(game.home)}`
    },
    text
  );
  return h(
    'li',
    { class: 'game-card' },
    options.label ? h('p', { class: 'label' }, options.label) : null,
    side(game.away, result ? result.awayScore : null, !!result && result.awayScore > result.homeScore),
    side(game.home, result ? result.homeScore : null, !!result && result.homeScore > result.awayScore),
    h('p', { class: 'game-status' }, ...status, link)
  );
}
