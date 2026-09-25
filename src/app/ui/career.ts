/**
 * Career stats on the player page (spec 9.1, 9.3): season totals by category with a career line, playoffs
 * apart, and a game-by-game log for any stored season. Wide tables scroll inside labeled regions (style
 * guide 7.3).
 */
import { teamFullName, type TeamAbbr } from '../../data/team-colors';
import type { Position } from '../../engine/model/positions';
import { careerTotals, type PlayerHistory, type SeasonLine, type Totals } from '../../engine/stats/aggregate';
import { CATEGORY_IDS, CATEGORY_KEYS, type CategoryId } from '../../engine/stats/categories';
import type { GameLogEntry } from '../../engine/stats/record';
import { h, mount, type Child } from '../dom';
import { card } from '../screens/common';
import { CATEGORY_TITLES, STAT_COLUMNS, type StatColumn } from './stat-columns';
import { scrollRegion, statCell, statHeader, statKey } from './stat-table';

/** Categories each position shows first; any other category with stats follows. */
const PRIMARY: Partial<Record<Position, readonly CategoryId[]>> = {
  QB: ['passing', 'rushing'],
  HB: ['rushing', 'receiving', 'returns'],
  FB: ['rushing', 'receiving', 'blocking'],
  WR: ['receiving', 'rushing', 'returns'],
  TE: ['receiving', 'blocking'],
  LT: ['blocking'],
  LG: ['blocking'],
  C: ['blocking'],
  RG: ['blocking'],
  RT: ['blocking'],
  K: ['kicking'],
  P: ['punting']
};

/** Playoff rounds by week (the season has 18 weeks). */
const ROUNDS: Record<number, string> = {
  19: 'Wild Card',
  20: 'Divisional',
  21: 'Conference',
  22: 'Super Bowl'
};

const has = (totals: Totals, category: CategoryId) =>
  CATEGORY_KEYS[category].some(k => (totals[k] ?? 0) !== 0);

/** The categories to show for a player, primary ones first, snaps last. */
export function categoriesFor(position: Position, lines: readonly { totals: Totals }[]): CategoryId[] {
  const shown = CATEGORY_IDS.filter(c => lines.some(l => has(l.totals, c)));
  const first = PRIMARY[position] ?? ['defense', 'returns'];
  return [
    ...first.filter(c => shown.includes(c)),
    ...shown.filter(c => !first.includes(c) && c !== 'participation'),
    ...(shown.includes('participation') ? (['participation'] as const) : [])
  ];
}

const team = (abbr: TeamAbbr) => h('abbr', { title: teamFullName(abbr) }, abbr);

function head(columns: readonly StatColumn[], lead: readonly [string, string, boolean][]): HTMLElement {
  return h(
    'thead',
    null,
    h(
      'tr',
      null,
      ...lead.map(([label, title, numeric]) => statHeader(label, title, numeric)),
      ...columns.map(c => statHeader(c.label, c.title))
    )
  );
}

const cells = (columns: readonly StatColumn[], totals: Totals): HTMLElement[] =>
  columns.map(c => statCell(c.value(totals), c.format));

function seasonTable(
  category: CategoryId,
  lines: readonly SeasonLine[],
  career: SeasonLine,
  playoffs: boolean
): HTMLElement {
  const columns = STAT_COLUMNS[category];
  const title = `${CATEGORY_TITLES[category]}${playoffs ? ', playoffs' : ''}`;
  const rows = lines.filter(l => has(l.totals, category));
  const table = h(
    'table',
    { class: 'stat-table' },
    h('caption', null, title),
    head(columns, [
      ['Season', 'Season and team', false],
      ['G', 'Games played', true],
      ['GS', 'Games started', true]
    ]),
    h(
      'tbody',
      null,
      ...rows.map(l =>
        h(
          'tr',
          null,
          // A player traded mid-season has a row per team, so the team is part of the row's name.
          h('th', { scope: 'row' }, `${l.season} `, team(l.team)),
          h('td', { class: 'num' }, String(l.games)),
          h('td', { class: 'num' }, String(l.starts)),
          ...cells(columns, l.totals)
        )
      )
    ),
    rows.length > 1
      ? h(
          'tfoot',
          null,
          h(
            'tr',
            null,
            h('th', { scope: 'row' }, 'Career'),
            h('td', { class: 'num' }, String(career.games)),
            h('td', { class: 'num' }, String(career.starts)),
            ...cells(columns, career.totals)
          )
        )
      : null
  );
  return scrollRegion(`${title} by season`, table);
}

const weekLabel = (e: GameLogEntry): string =>
  e.kind === 'playoffs'
    ? (ROUNDS[e.week] ?? `Playoff week ${e.week}`)
    : e.kind === 'preseason'
      ? `Preseason ${e.week}`
      : String(e.week);

function logTable(category: CategoryId, entries: readonly GameLogEntry[], season: number): HTMLElement {
  const columns = STAT_COLUMNS[category];
  const title = `${CATEGORY_TITLES[category]} game log, ${season}`;
  const result = (e: GameLogEntry) =>
    `${e.teamScore > e.opponentScore ? 'W' : e.teamScore < e.opponentScore ? 'L' : 'T'} ${e.teamScore}–${e.opponentScore}${e.overtime ? ' (OT)' : ''}`;
  const table = h(
    'table',
    { class: 'stat-table' },
    h('caption', null, title),
    head(columns, [
      ['Wk', 'Week', false],
      ['Opp', 'Opponent', false],
      ['Result', 'Result', false]
    ]),
    h(
      'tbody',
      null,
      ...entries.map(e =>
        h(
          'tr',
          null,
          h('th', { scope: 'row' }, weekLabel(e)),
          h(
            'td',
            null,
            e.opponent
              ? h(
                  'abbr',
                  { title: `${e.home ? 'Home against' : 'Away at'} ${teamFullName(e.opponent)}` },
                  `${e.home ? '' : '@'}${e.opponent}`
                )
              : '—'
          ),
          h('td', null, result(e)),
          ...cells(columns, e.line)
        )
      )
    )
  );
  return scrollRegion(title, table);
}

export interface CareerOptions {
  position: Position;
  history: PlayerHistory | null;
  /** Loads a season's game log (spec 9.3: one season at a time). */
  loadLog: (season: number) => Promise<GameLogEntry[]>;
}

/** The career stats card: season tables and a game log with season and category choices. */
export function careerCard({ position, history, loadLog }: CareerOptions): HTMLElement {
  const lines = history?.seasons ?? [];
  if (!lines.length) return card('Career stats', h('p', { class: 'empty' }, 'No games played yet.'));
  const regular = lines.filter(l => l.kind === 'regular');
  const playoffs = lines.filter(l => l.kind === 'playoffs');
  const categories = categoriesFor(position, lines);
  const careerRegular = careerTotals(history as PlayerHistory, 'regular');
  const careerPlayoffs = careerTotals(history as PlayerHistory, 'playoffs');
  const tables: Child[] = [];
  for (const c of categories)
    if (regular.some(l => has(l.totals, c))) tables.push(seasonTable(c, regular, careerRegular, false));
  for (const c of categories)
    if (playoffs.some(l => has(l.totals, c))) tables.push(seasonTable(c, playoffs, careerPlayoffs, true));

  // Game log: any stored season, one category at a time.
  const seasons = [...new Set(lines.map(l => l.season))].sort((a, b) => b - a);
  const seasonSelect = h(
    'select',
    { class: 'select', id: 'logSeason' },
    ...seasons.map(s => h('option', { value: String(s) }, String(s)))
  );
  const categorySelect = h(
    'select',
    { class: 'select', id: 'logCategory' },
    ...categories.map(c => h('option', { value: c }, CATEGORY_TITLES[c]))
  );
  const logBody = h('div', { class: 'stack' });
  // Announces what a change of season or category shows, without reading the table aloud.
  const status = h('p', { class: 'sr-only', role: 'status' });
  let entries: GameLogEntry[] = [];
  let loadedSeason = 0;
  let request = 0;
  let pending = false;
  const draw = (announce: boolean) => {
    const category = categorySelect.value as CategoryId;
    const shown = entries.filter(e => has(e.line, category));
    const name = CATEGORY_TITLES[category];
    mount(
      logBody,
      shown.length
        ? logTable(category, shown, loadedSeason)
        : h('p', { class: 'muted' }, `No ${name.toLowerCase()} stats in ${loadedSeason}.`)
    );
    if (announce)
      status.textContent = `${name} game log, ${loadedSeason}: ${shown.length} ${shown.length === 1 ? 'game' : 'games'}.`;
  };
  const load = async (announce: boolean) => {
    const season = Number(seasonSelect.value);
    const mine = ++request;
    pending = true;
    mount(logBody, h('p', { class: 'muted' }, `Loading the ${season} game log…`));
    performance.mark('game-log-start');
    let log: GameLogEntry[];
    try {
      log = await loadLog(season);
    } catch {
      if (mine !== request) return;
      pending = false;
      const retry = h('button', { class: 'btn btn-outline', type: 'button' }, 'Try again');
      retry.addEventListener('click', () => void load(true));
      mount(
        logBody,
        h('p', { class: 'empty' }, `The ${season} game log couldn't be read from this browser's storage.`),
        retry
      );
      if (announce) status.textContent = `The ${season} game log couldn't be loaded.`;
      return;
    }
    if (mine !== request) return;
    pending = false;
    entries = log;
    loadedSeason = season;
    draw(announce);
    performance.measure('game-log', 'game-log-start');
  };
  seasonSelect.addEventListener('change', () => void load(true));
  categorySelect.addEventListener('change', () => {
    if (!pending) draw(true);
  });
  void load(false);

  const allColumns = categories.flatMap(c => STAT_COLUMNS[c]);
  return card(
    'Career stats',
    ...tables,
    statKey([{ label: 'G', title: 'Games played' }, { label: 'GS', title: 'Games started' }, ...allColumns]),
    h('h3', null, 'Game log'),
    h(
      'div',
      { class: 'filterbar' },
      h('div', { class: 'field' }, h('label', { for: 'logSeason' }, 'Season'), seasonSelect),
      h('div', { class: 'field' }, h('label', { for: 'logCategory' }, 'Stats'), categorySelect)
    ),
    status,
    logBody
  );
}
