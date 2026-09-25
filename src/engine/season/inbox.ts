/**
 * The inbox v1 and pause rules (spec 19.6): messages for the user about their team, and the event types
 * that stop a multi-week advance. The user picks which event types pause; everything else waits in the
 * inbox. M7 raises injuries to starters; trade offers, contract demands, deadlines, draft picks, free agent
 * decisions, staff poaching, and rules votes arrive with the milestones that create them.
 */
import { TEAM_COLORS, type TeamAbbr } from '../../data/team-colors';
import { team } from '../../data/teams';
import type { League } from '../league/types';
import { fullName } from '../model/player';
import type { GameResult } from '../sim/types';
import { plural, withArticle } from '../text';
import type { WeeklyAward } from './awards';
import type { NewsItem } from './news';
import { leagueStandings } from './state';

export const PAUSE_EVENTS = [
  'starterInjuries',
  'tradeOffers',
  'contractDemands',
  'deadlines',
  'draftPicks',
  'freeAgentDecisions',
  'staffPoaching',
  'rulesVotes'
] as const;
export type PauseEvent = (typeof PAUSE_EVENTS)[number];

export const PAUSE_LABELS: Record<PauseEvent, string> = {
  starterInjuries: 'Injuries to your starters',
  tradeOffers: 'Trade offers',
  contractDemands: 'Contract demands and holdouts',
  deadlines: 'Expiring deadlines',
  draftPicks: 'Your draft pick on the clock',
  freeAgentDecisions: 'Free agent decisions on your offers',
  staffPoaching: 'Staff poaching attempts',
  rulesVotes: 'Rules votes'
};

/** Event types that can happen in this build; the settings list only these. */
export const LIVE_PAUSE_EVENTS: readonly PauseEvent[] = ['starterInjuries'];

export const defaultPauses = (): Record<PauseEvent, boolean> =>
  Object.fromEntries(PAUSE_EVENTS.map(e => [e, true])) as Record<PauseEvent, boolean>;

export type InboxKind = 'result' | 'injury' | 'award' | 'milestone' | 'playoffs';

export interface InboxItem {
  id: string;
  season: number;
  week: number;
  kind: InboxKind;
  /** The pause event type this message is, if it's one. */
  event: PauseEvent | null;
  title: string;
  body: string;
  read: boolean;
  players: string[];
}

const capitalize = (text: string): string => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

/** Messages kept at most; the oldest read ones go first. */
export const INBOX_LIMIT = 150;

const nick = (abbr: TeamAbbr): string => TEAM_COLORS[abbr].name;

export interface WeekInboxInput {
  week: number;
  results: readonly GameResult[];
  awards: readonly WeeklyAward[];
  news: readonly NewsItem[];
}

/** The user's messages from a finished week, in the league as it stands after the week. */
export function weekInbox(league: League, input: WeekInboxInput): InboxItem[] {
  const user = league.meta.start.userTeam;
  const season = league.season.season;
  const items: Omit<InboxItem, 'id'>[] = [];
  const add = (item: Omit<InboxItem, 'id' | 'season' | 'week' | 'read'>) =>
    items.push({ ...item, season, week: input.week, read: false });
  const playoff = input.week > league.rules.season.weeks;

  for (const r of input.results) {
    const side = r.home === user ? 'home' : r.away === user ? 'away' : null;
    if (!side) continue;
    const opp = side === 'home' ? r.away : r.home;
    const us = r.score[side];
    const them = r.score[side === 'home' ? 'away' : 'home'];
    const outcome = us > them ? 'Win' : us < them ? 'Loss' : 'Tie';
    const where = side === 'home' ? 'against' : 'at';
    const standing = leagueStandings(league).table.records[user];
    const record = standing
      ? `${standing.overall.wins}–${standing.overall.losses}${standing.overall.ties ? `–${standing.overall.ties}` : ''}`
      : '';
    add({
      kind: 'result',
      event: null,
      title: `${outcome} ${where} the ${nick(opp)}, ${us}–${them}${r.overtime ? ' in overtime' : ''}`,
      body: playoff
        ? us > them
          ? 'You advance to the next round.'
          : 'Your season is over.'
        : `Your record is ${record}.`,
      players: []
    });
    // Injuries: a starter's injury is a pause event; anyone else's just waits here.
    for (const injury of r.injuries) {
      if (injury.team !== user || injury.weeks < 1) continue;
      const player = league.players[injury.playerId];
      if (!player) continue;
      const started = (r.box[side].players[player.id]?.started ?? 0) > 0;
      const out = injury.severity === 'season' ? 'out for the season' : `out ${plural(injury.weeks, 'week')}`;
      add({
        kind: 'injury',
        event: started ? 'starterInjuries' : null,
        title: `${fullName(player)} (${player.position}) is ${out}`,
        body: `${capitalize(withArticle(injury.bodyPart))} injury against the ${nick(opp)}.${started ? ' Check your depth chart before the next game.' : ''}`,
        players: [player.id]
      });
    }
  }

  const words = { offense: 'Offensive', defense: 'Defensive', special: 'Special Teams' } as const;
  for (const a of input.awards) {
    if (a.team !== user) continue;
    const player = league.players[a.playerId];
    if (!player) continue;
    add({
      kind: 'award',
      event: null,
      title: `${fullName(player)} is the ${a.conference} ${words[a.category]} Player of the Week`,
      body: a.line ? `${capitalize(a.line)}.` : '',
      players: [a.playerId]
    });
  }

  for (const n of input.news)
    if (n.kind === 'milestone' && n.teams.includes(user))
      add({ kind: 'milestone', event: null, title: n.headline, body: '', players: n.players });

  // The regular season's end: in or out, and the seed.
  if (input.week === league.rules.season.weeks && league.season.seeds) {
    const conference = team(user).conf;
    const seed = league.season.seeds[conference].indexOf(user);
    add({
      kind: 'playoffs',
      event: null,
      title:
        seed >= 0
          ? `You're in the playoffs as the ${conference}'s ${seed + 1} seed`
          : 'You missed the playoffs',
      body: seed === 0 ? 'The top seed earns a bye through the Wild Card round.' : '',
      players: []
    });
  }
  return items.map((item, i) => ({ ...item, id: `${season}-${input.week}-${i}` }));
}

/** Adds messages to the inbox, trimming the oldest read ones past the limit. */
export function addToInbox(inbox: readonly InboxItem[], items: readonly InboxItem[]): InboxItem[] {
  const all = [...inbox, ...items];
  let extra = all.length - INBOX_LIMIT;
  if (extra <= 0) return all;
  return all.filter(item => {
    if (extra > 0 && item.read) {
      extra--;
      return false;
    }
    return true;
  });
}

/** The messages that stop a multi-week advance under the user's pause settings. */
export const pausing = (
  items: readonly InboxItem[],
  pauses: Readonly<Record<PauseEvent, boolean>>
): InboxItem[] => items.filter(item => item.event !== null && pauses[item.event]);
