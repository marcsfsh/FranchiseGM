/**
 * League stats (spec 19.3): player leaderboards for a season or a career, by any stored stat or a rate
 * (rates need the NFL's minimums), filtered by position and team; and team offense and defense for a
 * season. Choices last while the user moves around the app.
 */
import { TEAM_ABBRS, teamFullName, type TeamAbbr } from '../../data/team-colors';
import type { League } from '../../engine/league/types';
import { POSITIONS, type Position } from '../../engine/model/positions';
import { LONG_STATS, type StatKey } from '../../engine/sim/stats';
import { CATEGORY_IDS, CATEGORY_KEYS, type CategoryId } from '../../engine/stats/categories';
import {
  isRate,
  leaderboard,
  RATE_STATS,
  rateMinimum,
  type BoardEntry,
  type BoardStat,
  type PlayerTotals,
  type RateStat,
  type TeamSeasonStats
} from '../../engine/stats/leaders';
import { RECORD_STATS } from '../../engine/stats/records';
import { h, mount } from '../dom';
import type { AppState } from '../state';
import { nick, teamLink } from '../ui/games';
import { playerLink } from '../ui/players';
import { CATEGORY_TITLES, formatStat, STAT_NAMES, type StatColumn } from '../ui/stat-columns';
import { scrollRegion, statHeader } from '../ui/stat-table';
import { card } from './common';

/** How many players a board lists. */
const BOARD_SIZE = 50;

const RATE_NAMES: Record<RateStat, [name: string, format: StatColumn['format']]> = {
  completionPct: ['Completion percentage', 'pct'],
  yardsPerAttempt: ['Yards per pass attempt', 'one'],
  adjustedYardsPerAttempt: ['Adjusted yards per pass attempt', 'one'],
  passerRating: ['Passer rating', 'rating'],
  yardsPerCarry: ['Yards per carry', 'one'],
  yardsPerCatch: ['Yards per catch', 'one'],
  catchRate: ['Catch rate', 'pct'],
  fieldGoalPct: ['Field goal percentage', 'pct'],
  puntAverage: ['Gross punt average', 'one'],
  netPuntAverage: ['Net punt average', 'one'],
  kickReturnAverage: ['Kick return average', 'one'],
  puntReturnAverage: ['Punt return average', 'one']
};

/** Which category each rate belongs with in the stat menu. */
const RATE_CATEGORY: Record<RateStat, CategoryId> = {
  completionPct: 'passing',
  yardsPerAttempt: 'passing',
  adjustedYardsPerAttempt: 'passing',
  passerRating: 'passing',
  yardsPerCarry: 'rushing',
  yardsPerCatch: 'receiving',
  catchRate: 'receiving',
  fieldGoalPct: 'kicking',
  puntAverage: 'punting',
  netPuntAverage: 'punting',
  kickReturnAverage: 'returns',
  puntReturnAverage: 'returns'
};

/** What a rate's minimum counts, in a sentence: "attempts". */
const MINIMUM_WORDS: Record<(typeof RATE_STATS)[RateStat], string> = {
  passAtt: 'pass attempts',
  rushAtt: 'carries',
  receptions: 'catches',
  targets: 'targets',
  fgAtt: 'field goal attempts',
  punts: 'punts',
  kickReturns: 'kick returns',
  puntReturns: 'punt returns'
};

const statName = (stat: BoardStat): string => (isRate(stat) ? RATE_NAMES[stat][0] : STAT_NAMES[stat]);
const statFormat = (stat: BoardStat): StatColumn['format'] => (isRate(stat) ? RATE_NAMES[stat][1] : 'int');

type StatsView = 'players' | 'teams';

/** The choices, kept for the session. A null season follows the league's current one. */
const choice: {
  view: StatsView;
  scope: 'season' | 'career';
  season: number | null;
  stat: BoardStat;
  position: Position | 'all';
  team: TeamAbbr | 'all';
} = { view: 'players', scope: 'season', season: null, stat: 'passYds', position: 'all', team: 'all' };

/** Loaded totals by league state, so changing a filter doesn't read storage again. */
const loaded = new WeakMap<League, Map<string, Promise<unknown>>>();
function once<T>(league: League, key: string, load: () => Promise<T>): Promise<T> {
  let map = loaded.get(league);
  if (!map) {
    map = new Map();
    loaded.set(league, map);
  }
  let found = map.get(key) as Promise<T> | undefined;
  if (!found) {
    found = load();
    map.set(key, found);
    found.catch(() => map?.delete(key));
  }
  return found;
}

/** Ranks with ties shared: 1, T-2, T-2, 4. */
function ranks(entries: readonly BoardEntry[]): string[] {
  return entries.map(e => {
    const first = entries.findIndex(x => x.value === e.value);
    const tied = entries.filter(x => x.value === e.value).length > 1;
    return `${tied ? 'T-' : ''}${first + 1}`;
  });
}

/** A club's abbreviation, with its full name for assistive technology and on hover. */
const teamCell = (abbr: TeamAbbr) =>
  h(
    'td',
    null,
    h('abbr', { title: teamFullName(abbr), 'aria-hidden': 'true' }, abbr),
    h('span', { class: 'sr-only' }, teamFullName(abbr))
  );
/** A cell with nothing to show: a dash, read out as `meaning`. */
const noneCell = (meaning: string, numeric = false) =>
  h(
    'td',
    { class: numeric ? 'num' : null },
    h('span', { 'aria-hidden': 'true' }, '—'),
    h('span', { class: 'sr-only' }, meaning)
  );

function boardTable(league: League, entries: readonly BoardEntry[], caption: string): HTMLElement {
  const rank = ranks(entries);
  const format = statFormat(choice.stat);
  // The ranked value comes right after the name, so a narrow screen shows it without scrolling.
  const value = statHeader(isRate(choice.stat) ? 'Rate' : 'Total', statName(choice.stat));
  const table = h(
    'table',
    { class: 'stat-table leader-table' },
    h('caption', null, caption),
    h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Rank'), h('th', { scope: 'col' }, 'Player'), value, h('th', { scope: 'col' }, 'Pos'), h('th', { scope: 'col' }, 'Team'), statHeader('G', 'Games played'))),
    h('tbody', null, ...entries.map((e, i) => {
      const p = league.players[e.playerId];
      return h('tr', null, h('td', null, rank[i] ?? ''), h('th', { scope: 'row' }, p ? playerLink(p) : 'Former player'), h('td', { class: 'num' }, formatStat(e.value, format)), p ? h('td', null, p.position) : noneCell('Position not known'), teamCell(e.team), h('td', { class: 'num' }, String(e.games)));
    }))
  ); // prettier-ignore
  return scrollRegion(caption, table);
}

function statOptions(): HTMLElement[] {
  return CATEGORY_IDS.flatMap(category => {
    const stored: StatKey[] = [
      ...(category === 'defense' ? (['tackles'] as const) : []),
      ...CATEGORY_KEYS[category].filter(k => RECORD_STATS.includes(k) && !LONG_STATS.has(k))
    ];
    const rates = (Object.keys(RATE_CATEGORY) as RateStat[]).filter(r => RATE_CATEGORY[r] === category);
    const all: BoardStat[] = [...stored, ...rates];
    return all.length
      ? [
          h(
            'optgroup',
            { label: CATEGORY_TITLES[category] },
            ...all.map(k => h('option', { value: k }, statName(k)))
          )
        ]
      : [];
  });
}

const select = (id: string, label: string, options: readonly (HTMLElement | [string, string])[]) => {
  const control = h(
    'select',
    { class: 'select', id },
    ...options.map(o => (o instanceof HTMLElement ? o : h('option', { value: o[0] }, o[1])))
  );
  return { control, field: h('div', { class: 'field' }, h('label', { for: id }, label), control) };
};

function playersView(app: AppState, league: League, seasons: readonly number[]): HTMLElement {
  const id = league.meta.id;
  const scope = select('statsScope', 'Totals', [
    ['season', 'Season'],
    ['career', 'Career']
  ]);
  const season = select(
    'statsSeason',
    'Season',
    [...seasons].reverse().map(s => [String(s), String(s)] as [string, string])
  );
  const stat = select('statsStat', 'Stat', statOptions());
  const position = select('statsPosition', 'Position', [
    ['all', 'All positions'],
    ...POSITIONS.map(p => [p, p] as [string, string])
  ]);
  const user = league.meta.start.userTeam;
  const others = TEAM_ABBRS.filter(t => t !== user).sort((a, b) => nick(a).localeCompare(nick(b)));
  const team = select('statsTeam', 'Team', [
    ['all', 'All teams'],
    [user, `${nick(user)} (your team)`],
    ...others.map(t => [t, nick(t)] as [string, string])
  ]);
  const status = h('p', { class: 'sr-only', role: 'status' });
  const body = h('div', { class: 'stack' }, h('p', { class: 'muted' }, 'Loading the leaders…'));
  let drawn = 0;
  const draw = async (announce: boolean) => {
    const turn = ++drawn;
    const shownSeason = choice.season ?? seasons.at(-1) ?? league.season.season;
    scope.control.value = choice.scope;
    season.control.value = String(shownSeason);
    // Career totals span every season, so the season choice steps aside.
    season.field.hidden = choice.scope === 'career';
    stat.control.value = choice.stat;
    position.control.value = choice.position;
    team.control.value = choice.team;
    try {
      const [players, summary] = await Promise.all([
        choice.scope === 'career'
          ? once(league, 'career', () => app.store.history.careerPlayerTotals(id))
          : once(league, `season-${shownSeason}`, () => app.store.history.seasonPlayerTotals(id, shownSeason)),
        once(league, `summary-${shownSeason}`, () => app.store.history.season(id, shownSeason))
      ]);
      if (turn !== drawn) return;
      const teamGames = Math.max(0, ...(summary?.teams ?? []).filter(t => t.kind === 'regular').map(t => t.games));
      const minimum = isRate(choice.stat) ? rateMinimum(choice.stat, choice.scope, teamGames) : 0;
      const keep = (p: PlayerTotals) =>
        (choice.team === 'all' || p.team === choice.team) &&
        (choice.position === 'all' || league.players[p.playerId]?.position === choice.position);
      const entries = leaderboard(players, choice.stat, { keep, minimum, limit: BOARD_SIZE });
      const label = statName(choice.stat);
      const where = choice.scope === 'career' ? 'career, regular season' : `${shownSeason} regular season`;
      const caption = `${label}, ${where}`;
      mount(
        body,
        isRate(choice.stat) ? h('p', { class: 'hint' }, `Players with at least ${minimum.toLocaleString('en-US')} ${MINIMUM_WORDS[RATE_STATS[choice.stat]]} qualify.`) : null,
        entries.length ? boardTable(league, entries, caption) : h('p', { class: 'empty' }, players.length ? 'No player matches these choices yet.' : 'No games have been played yet.')
      );
      if (announce) status.textContent = `${caption}: ${entries.length} ${entries.length === 1 ? 'player' : 'players'}.`;
    } catch {
      if (turn === drawn) mount(body, h('p', { class: 'empty' }, "The stats couldn't be read from this browser's storage. Reload the page to try again."));
    }
  }; // prettier-ignore
  scope.control.addEventListener('change', () => {
    choice.scope = scope.control.value === 'career' ? 'career' : 'season';
    void draw(true);
  });
  season.control.addEventListener('change', () => {
    choice.season = Number(season.control.value);
    void draw(true);
  });
  stat.control.addEventListener('change', () => {
    choice.stat = stat.control.value as BoardStat;
    void draw(true);
  });
  position.control.addEventListener('change', () => {
    choice.position = position.control.value as Position | 'all';
    void draw(true);
  });
  team.control.addEventListener('change', () => {
    choice.team = team.control.value as TeamAbbr | 'all';
    void draw(true);
  });
  void draw(false);
  return h(
    'div',
    { class: 'stack' },
    h('div', { class: 'filterbar' }, scope.field, season.field, stat.field, position.field, team.field),
    status,
    body
  );
}

const perGame = (total: number, games: number): HTMLElement =>
  games ? h('td', { class: 'num' }, formatStat(total / games, 'one')) : noneCell('No games', true);
const rate = (made: number, tries: number): HTMLElement =>
  tries ? h('td', { class: 'num' }, formatStat((made / tries) * 100, 'pct')) : noneCell('No attempts', true);
const count = (n: number): HTMLElement => h('td', { class: 'num' }, String(n));

/** Team offense or defense, one row per club, best first. */
function teamTable(
  league: League,
  stats: readonly TeamSeasonStats[],
  side: 'offense' | 'defense',
  season: number
): HTMLElement {
  const user = league.meta.start.userTeam;
  const rows = [...stats]
    .filter(t => t.games)
    .sort((a, b) =>
      side === 'offense'
        ? b.pointsFor / b.games - a.pointsFor / a.games
        : a.pointsAgainst / a.games - b.pointsAgainst / b.games
    );
  const offense = side === 'offense';
  const head = offense
    ? [
        statHeader('G', 'Games'),
        statHeader('Pts/G', 'Points per game'),
        statHeader('Yds/G', 'Yards per game'),
        statHeader('Pass/G', 'Net passing yards per game'),
        statHeader('Rush/G', 'Rushing yards per game'),
        statHeader('3rd%', 'Third down conversion rate'),
        statHeader('RZ%', 'Red zone touchdown rate'),
        statHeader('TO', 'Turnovers')
      ]
    : [
        statHeader('G', 'Games'),
        statHeader('Pts/G', 'Points allowed per game'),
        statHeader('Yds/G', 'Yards allowed per game'),
        statHeader('Pass/G', 'Net passing yards allowed per game'),
        statHeader('Rush/G', 'Rushing yards allowed per game'),
        statHeader('Sk', 'Sacks'),
        statHeader('TA', 'Takeaways')
      ];
  const cells = (t: TeamSeasonStats) => {
    const o = t.offense;
    const d = t.defense;
    return offense
      ? [
          count(t.games),
          perGame(t.pointsFor, t.games),
          perGame(o.totalYards, t.games),
          perGame(o.netPassYds, t.games),
          perGame(o.rushYds, t.games),
          rate(o.thirdDownConv, o.thirdDownAtt),
          rate(o.redZoneTd, o.redZoneTrips),
          count(o.turnovers)
        ]
      : [
          count(t.games),
          perGame(t.pointsAgainst, t.games),
          perGame(d.totalYards, t.games),
          perGame(d.netPassYds, t.games),
          perGame(d.rushYds, t.games),
          count(d.sacked),
          count(d.turnovers)
        ];
  };
  const caption = `${season} team ${side}, ${offense ? 'most points first' : 'fewest points allowed first'}`;
  const table = h(
    'table',
    { class: 'stat-table standings-table' },
    h('caption', null, caption),
    h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Team'), ...head)),
    h('tbody', null, ...rows.map(t => h('tr', { class: t.team === user ? 'is-us' : null }, h('th', { scope: 'row' }, teamLink(t.team), t.team === user ? h('span', { class: 'sr-only' }, ' (your team)') : null), ...cells(t))))
  ); // prettier-ignore
  return scrollRegion(caption, table);
}

function teamsView(app: AppState, league: League, seasons: readonly number[]): HTMLElement {
  const season = select(
    'teamStatsSeason',
    'Season',
    [...seasons].reverse().map(s => [String(s), String(s)] as [string, string])
  );
  const body = h('div', { class: 'stack' }, h('p', { class: 'muted' }, 'Loading team stats…'));
  const status = h('p', { class: 'sr-only', role: 'status' });
  let drawn = 0;
  const draw = async (announce: boolean) => {
    const turn = ++drawn;
    const shown = choice.season ?? seasons.at(-1) ?? league.season.season;
    season.control.value = String(shown);
    try {
      const stats = await once(league, `teams-${shown}`, () => app.store.history.teamStats(league.meta.id, shown));
      // A slower load of an earlier choice never replaces the season picked since.
      if (turn !== drawn) return;
      const clubs = stats.filter(t => t.games).length;
      mount(
        body,
        clubs
          ? h('div', { class: 'stack' }, card('Offense', teamTable(league, stats, 'offense', shown)), card('Defense', teamTable(league, stats, 'defense', shown)))
          : h('p', { class: 'empty' }, 'No games have been played yet.')
      );
      if (announce) status.textContent = `${shown} team stats: ${clubs} teams.`;
    } catch {
      if (turn === drawn) mount(body, h('p', { class: 'empty' }, "The stats couldn't be read from this browser's storage. Reload the page to try again."));
    }
  }; // prettier-ignore
  season.control.addEventListener('change', () => {
    choice.season = Number(season.control.value);
    void draw(true);
  });
  void draw(false);
  return h('div', { class: 'stack' }, h('div', { class: 'filterbar' }, season.field), status, body);
}

/** The Stats tab: players or teams. */
export function statsPanel(app: AppState, league: League): HTMLElement {
  const body = h('div', { class: 'stack' }, h('p', { class: 'muted' }, 'Loading…'));
  const views: [StatsView, string][] = [
    ['players', 'Players'],
    ['teams', 'Teams']
  ];
  let seasons: number[] = [];
  const draw = () =>
    mount(
      body,
      choice.view === 'players' ? playersView(app, league, seasons) : teamsView(app, league, seasons)
    );
  const picker = h(
    'fieldset',
    { class: 'view-switch' },
    h('legend', { class: 'field-label' }, 'Leaders'),
    h('div', { class: 'seg' }, ...views.map(([v, label]) => {
      const input = h('input', { type: 'radio', id: `stats-${v}`, name: 'statsView', value: v, checked: v === choice.view });
      input.addEventListener('change', () => {
        choice.view = v;
        draw();
      });
      return h('label', null, input, label);
    }))
  ); // prettier-ignore
  void once(league, 'seasons', () => app.store.history.seasons(league.meta.id)).then(
    found => {
      seasons = found.length ? found : [league.season.season];
      if (choice.season !== null && !seasons.includes(choice.season)) choice.season = null;
      draw();
    },
    () => mount(body, h('p', { class: 'empty' }, "The stats couldn't be read from this browser's storage. Reload the page to try again."))
  ); // prettier-ignore
  return h('div', { class: 'stack' }, picker, body);
}
