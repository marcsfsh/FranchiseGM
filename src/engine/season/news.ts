/**
 * The news feed v1 (spec 18.1): items from the week's events (results and upsets, big games, season
 * milestones, injuries, and signings), each with a newsworthiness score from the players' and teams'
 * prominence, the event's rarity, and its stakes. The week keeps its top items, the players of the week
 * as a weekly feature, and every item about the user's team. Headlines come from several templates per
 * event, and a team doesn't see the same template twice within four weeks.
 */
import { superBowlName } from '../../data/super-bowl';
import { TEAM_COLORS, type TeamAbbr } from '../../data/team-colors';
import type { Transaction } from '../league/transactions';
import type { League } from '../league/types';
import { fullName, type Player } from '../model/player';
import type { Rng } from '../rng';
import type { PlayerLine, StatKey } from '../sim/stats';
import type { GameResult } from '../sim/types';
import { TUNING } from '../tuning';
import { numberArticle, plural, possessive, withArticle } from '../text';
import type { WeeklyAward } from './awards';

const N = TUNING.news;

export type NewsKind = 'result' | 'upset' | 'performance' | 'milestone' | 'injury' | 'transaction' | 'award';

export interface NewsItem {
  id: string;
  season: number;
  /** The schedule week (playoff rounds follow the regular season's weeks). */
  week: number;
  kind: NewsKind;
  headline: string;
  teams: TeamAbbr[];
  players: string[];
  /** Newsworthiness (spec 18.1). */
  score: number;
  /** The headline template, so a team doesn't see the same one again soon. */
  template: string;
}

/** A player's season totals for the stats news follows. */
export type SeasonLine = Partial<Record<StatKey, number>>;

/** Season stats the feed and the milestones follow. */
export const SEASON_KEYS = [
  'passYds', 'passTd', 'passInt', 'rushYds', 'rushTd', 'recYds', 'recTd', 'receptions', 'sacks', 'defInt',
  'tackles', 'fgMade'
] as const satisfies readonly StatKey[]; // prettier-ignore

const nick = (abbr: TeamAbbr): string => TEAM_COLORS[abbr].name;

interface Candidate {
  kind: NewsKind;
  /** Headline templates: {W}, {L}, {name}, and other fields fill in from `fill`. */
  templates: readonly string[];
  fill: Record<string, string>;
  teams: TeamAbbr[];
  players: string[];
  score: number;
}

/** Mean overall of a team's best 22 active players: its strength before any records exist. */
function strength(league: League, abbr: TeamAbbr): number {
  const top = Object.values(league.players)
    .filter(p => p.team === abbr && p.status === 'active')
    .map(p => p.ovr)
    .sort((a, b) => b - a)
    .slice(0, 22);
  return top.length ? top.reduce((a, b) => a + b, 0) / top.length : 0;
}

/** A player's prominence: how much his overall adds to a story about him. */
const prominence = (p: Player | undefined): number =>
  p ? Math.max(0, p.ovr - N.prominentFrom) * N.perOverall : 0;

function resultCandidates(league: League, results: readonly GameResult[], week: number): Candidate[] {
  const playoff = week > league.rules.season.weeks;
  const out: Candidate[] = [];
  for (const r of results) {
    const home = r.score.home;
    const away = r.score.away;
    const stakes = playoff
      ? week === league.rules.season.weeks + 4
        ? N.superBowlStakes
        : N.playoffStakes
      : 1;
    if (home === away) {
      out.push({
        kind: 'result',
        templates: ['The {H} and {A} tie {s}–{s}', '{H} and {A} play to a {s}–{s} tie'],
        fill: { H: nick(r.home), A: nick(r.away), s: String(home) },
        teams: [r.home, r.away],
        players: [],
        score: N.tie * stakes
      });
      continue;
    }
    const [w, l, ws, ls] = home > away ? [r.home, r.away, home, away] : [r.away, r.home, away, home];
    const margin = ws - ls;
    const gap = strength(league, l) - strength(league, w);
    const upset = !playoff && gap >= N.upsetGap;
    const fill = {
      W: nick(w),
      L: nick(l),
      Ls: `The ${possessive(nick(l))}`,
      ws: String(ws),
      'a ws': `${numberArticle(ws)} ${ws}`,
      ls: String(ls),
      sb: superBowlName(league.season.season)
    };
    const templates =
      week === league.rules.season.weeks + 4
        ? ['The {W} win {sb}, beating the {L} {ws}–{ls}', 'The {W} are champions after {a ws}–{ls} win over the {L} in {sb}']
        : playoff
          ? ['The {W} beat the {L} {ws}–{ls} to advance', 'The {W} move on with {a ws}–{ls} win over the {L}', "{Ls} season ends in {a ws}–{ls} loss to the {W}"]
          : upset
            ? ['The {W} stun the {L} {ws}–{ls}', 'Upset: the {W} knock off the {L} {ws}–{ls}', 'The {W} take down the favored {L} {ws}–{ls}']
            : r.overtime
              ? ['The {W} beat the {L} {ws}–{ls} in overtime', 'The {W} outlast the {L} {ws}–{ls} in overtime']
              : margin >= N.blowout
                ? ['The {W} rout the {L} {ws}–{ls}', 'The {W} roll past the {L} {ws}–{ls}', 'The {W} run away from the {L}, {ws}–{ls}']
                : margin <= N.close
                  ? ['The {W} edge the {L} {ws}–{ls}', 'The {W} hold off the {L} {ws}–{ls}', 'The {W} squeak past the {L} {ws}–{ls}']
                  : ['The {W} beat the {L} {ws}–{ls}', 'The {W} top the {L} {ws}–{ls}', 'The {W} handle the {L} {ws}–{ls}']; // prettier-ignore
    out.push({
      kind: upset ? 'upset' : 'result',
      templates,
      fill,
      teams: [w, l],
      players: [],
      score:
        (N.result + (upset ? gap * N.perUpsetPoint : 0) + (r.overtime ? N.overtime : 0) + (margin >= N.blowout ? N.blowoutBonus : 0)) *
        stakes
    }); // prettier-ignore
  }
  return out;
}

/** Big single games (spec 18.1 "big performances"). */
function performanceCandidates(league: League, results: readonly GameResult[]): Candidate[] {
  const out: Candidate[] = [];
  const feats: { key: StatKey; at: number; text: (l: PlayerLine) => string }[] = [
    { key: 'passYds', at: N.bigGame.passYds, text: l => `throws for ${plural(l.passYds, 'yard')}` },
    { key: 'passTd', at: N.bigGame.passTd, text: l => `throws ${plural(l.passTd, 'touchdown pass', 'touchdown passes')}` },
    { key: 'rushYds', at: N.bigGame.rushYds, text: l => `runs for ${plural(l.rushYds, 'yard')}` },
    { key: 'recYds', at: N.bigGame.recYds, text: l => `catches ${plural(l.receptions, 'pass', 'passes')} for ${plural(l.recYds, 'yard')}` },
    { key: 'sacks', at: N.bigGame.sacks, text: l => `records ${plural(l.sacks, 'sack')}` },
    { key: 'defInt', at: N.bigGame.defInt, text: l => `picks off ${plural(l.defInt, 'pass', 'passes')}` }
  ]; // prettier-ignore
  for (const r of results) {
    for (const side of ['home', 'away'] as const) {
      const abbr = r[side];
      const opp = side === 'home' ? r.away : r.home;
      const won = r.score[side] > r.score[side === 'home' ? 'away' : 'home'];
      for (const [id, line] of Object.entries(r.box[side].players)) {
        const feat = feats.find(f => line[f.key] >= f.at);
        const player = league.players[id];
        if (!feat || !player) continue;
        out.push({
          kind: 'performance',
          templates: won
            ? ['{name} {feat} as the {T} beat the {O}', '{name} {feat} in a win over the {O}', 'The {T} beat the {O} behind {name}, who {feat}']
            : ['{name} {feat} in a loss to the {O}', '{name} {feat}, but the {T} fall to the {O}'],
          fill: { name: fullName(player), feat: feat.text(line), T: nick(abbr), O: nick(opp) },
          teams: [abbr],
          players: [id],
          score: N.performance * (line[feat.key] / feat.at) + prominence(player)
        }); // prettier-ignore
      }
    }
  }
  return out;
}

/** Season marks passed this week (spec 18.1 milestones). */
export function milestoneCandidates(
  league: League,
  before: Readonly<Record<string, SeasonLine>>,
  after: Readonly<Record<string, SeasonLine>>
): Candidate[] {
  const out: Candidate[] = [];
  for (const [id, now] of Object.entries(after)) {
    const player = league.players[id];
    if (!player?.team) continue;
    for (const [key, marks] of Object.entries(N.milestones) as [
      keyof typeof N.milestones,
      readonly number[]
    ][]) {
      const was = before[id]?.[key] ?? 0;
      const is = now[key] ?? 0;
      const mark = [...marks].reverse().find(m => was < m && is >= m);
      if (!mark) continue;
      const rank = marks.indexOf(mark) + 1;
      out.push({
        kind: 'milestone',
        templates: ['{name} passes {mark} for the season', '{name} reaches {mark} on the season', '{Ts} {name} tops {mark} for the year'],
        fill: { name: fullName(player), mark: plural(mark, N.milestoneWords[key]), Ts: `The ${possessive(nick(player.team))}` },
        teams: [player.team],
        players: [id],
        score: N.milestone * rank + prominence(player)
      }); // prettier-ignore
    }
  }
  return out;
}

function injuryCandidates(league: League, results: readonly GameResult[]): Candidate[] {
  const out: Candidate[] = [];
  for (const r of results)
    for (const injury of r.injuries) {
      const player = league.players[injury.playerId];
      if (!player || injury.weeks < 1 || player.ovr < N.injuryFrom) continue;
      const season = injury.severity === 'season';
      out.push({
        kind: 'injury',
        templates: season
          ? ["{Ts} {name} is out for the season with {a part} injury", '{name} ({pos}) suffers a season-ending {part} injury']
          : ["{Ts} {name} will miss {weeks} with {a part} injury", '{name} ({pos}) is out {weeks} with {a part} injury'],
        fill: { Ts: `The ${possessive(nick(injury.team))}`, name: fullName(player), pos: player.position, part: injury.bodyPart, 'a part': withArticle(injury.bodyPart), weeks: plural(injury.weeks, 'week') },
        teams: [injury.team],
        players: [player.id],
        score:
          N.injury * Math.min(injury.weeks, N.injuryWeeksCap) + (season ? N.seasonEnding : 0) + prominence(player)
      }); // prettier-ignore
    }
  return out;
}

function transactionCandidates(league: League, moves: readonly Transaction[]): Candidate[] {
  const out: Candidate[] = [];
  for (const t of moves) {
    const player = league.players[t.playerId];
    if (!player || (t.kind !== 'signed' && t.kind !== 'promoted') || player.ovr < N.signingFrom) continue;
    out.push({
      kind: 'transaction',
      templates:
        t.kind === 'signed'
          ? ['The {T} sign {pos} {name}', 'The {T} add {pos} {name}']
          : [
              'The {T} promote {pos} {name} from the practice squad',
              '{name} ({pos}) joins the {T} active roster'
            ],
      fill: { T: nick(t.team), pos: player.position, name: fullName(player) },
      teams: [t.team],
      players: [player.id],
      score: N.transaction + prominence(player)
    });
  }
  return out;
}

function awardCandidates(league: League, awards: readonly WeeklyAward[]): Candidate[] {
  const words = { offense: 'Offensive', defense: 'Defensive', special: 'Special Teams' } as const;
  return awards.flatMap(a => {
    const player = league.players[a.playerId];
    if (!player) return [];
    return [
      {
        kind: 'award' as const,
        templates: [
          '{name} is the {conf} {cat} Player of the Week',
          '{conf} {cat} Player of the Week: {name}'
        ],
        fill: { name: fullName(player), conf: a.conference, cat: words[a.category] },
        teams: [a.team],
        players: [a.playerId],
        score: N.award
      }
    ];
  });
}

export interface WeekNewsInput {
  week: number;
  results: readonly GameResult[];
  awards: readonly WeeklyAward[];
  /** Season totals before and after the week. */
  before: Readonly<Record<string, SeasonLine>>;
  after: Readonly<Record<string, SeasonLine>>;
  /** Roster moves made this week. */
  moves: readonly Transaction[];
}

/** The week's news: the top items plus every item about the user's team, best first. */
export function weekNews(league: League, input: WeekNewsInput, rng: Rng): NewsItem[] {
  const season = league.season.season;
  const user = league.meta.start.userTeam;
  const candidates = [
    ...resultCandidates(league, input.results, input.week),
    ...performanceCandidates(league, input.results),
    ...milestoneCandidates(league, input.before, input.after),
    ...injuryCandidates(league, input.results),
    ...transactionCandidates(league, input.moves),
    ...awardCandidates(league, input.awards)
  ].sort(
    (a, b) =>
      b.score - a.score || (a.fill.name ?? a.fill.W ?? '').localeCompare(b.fill.name ?? b.fill.W ?? '')
  );
  // Players of the week are a weekly feature (spec 18.1): always in, outside the top items.
  const stories = candidates.filter(c => c.kind !== 'award');
  const chosen = [
    ...stories.slice(0, N.perWeek),
    ...candidates.filter(c => c.kind === 'award'),
    ...stories.slice(N.perWeek).filter(c => c.teams.includes(user))
  ];
  // Templates a team saw in the last few weeks.
  const recent = league.season.news.filter(n => n.week > input.week - N.templateWeeks);
  return chosen.map((c, i) => {
    const used = new Set(recent.filter(n => c.teams.some(t => n.teams.includes(t))).map(n => n.template));
    const fresh = c.templates.filter(t => !used.has(t));
    const template = rng.pick(fresh.length ? fresh : c.templates);
    const headline = template.replace(/\{([\w ]+)\}/g, (_, key: string) => c.fill[key] ?? '');
    return {
      id: `${season}-${input.week}-${i}`,
      season,
      week: input.week,
      kind: c.kind,
      headline,
      teams: c.teams,
      players: c.players,
      score: Math.round(c.score * 10) / 10,
      template
    };
  });
}

/** Adds a week's box score lines to season totals, returning the new totals. */
export function addToTotals(
  totals: Readonly<Record<string, SeasonLine>>,
  results: readonly GameResult[]
): Record<string, SeasonLine> {
  const next: Record<string, SeasonLine> = { ...totals };
  for (const r of results)
    for (const side of ['home', 'away'] as const)
      for (const [id, line] of Object.entries(r.box[side].players)) {
        const was = next[id] ?? {};
        const now: SeasonLine = { ...was };
        for (const key of SEASON_KEYS) if (line[key]) now[key] = (now[key] ?? 0) + line[key];
        next[id] = now;
      }
  return next;
}
