/**
 * History v1 (spec 18.5, 18.6): the records book, with the best single games, seasons, and careers for
 * every tracked stat, and team records. Past seasons and awards join it in M17.
 */
import { teamFullName, type TeamAbbr } from '../../data/team-colors';
import type { League } from '../../engine/league/types';
import { fullName } from '../../engine/model/player';
import type { StatKey } from '../../engine/sim/stats';
import { LONG_STATS } from '../../engine/sim/stats';
import { CATEGORY_IDS, CATEGORY_KEYS } from '../../engine/stats/categories';
import {
  RECORD_STATS,
  type RecordEntry,
  type RecordsBook,
  type Scope,
  type TeamRecordId
} from '../../engine/stats/records';
import { h, mount } from '../dom';
import { href } from '../router';
import { CATEGORY_TITLES, STAT_NAMES, formatStat } from '../ui/stat-columns';
import { sortableTable, type TableColumn } from '../ui/sortable';
import { card, pageHead } from './common';
import type { Screen } from './types';

type View = Scope | 'team';

const SCOPES: { id: View; label: string }[] = [
  { id: 'game', label: 'Single game' },
  { id: 'season', label: 'Single season' },
  { id: 'career', label: 'Career' },
  { id: 'team', label: 'Team records' }
];

const TEAM_RECORDS: { id: TeamRecordId; label: string }[] = [
  { id: 'wins', label: 'Wins in a season' },
  { id: 'points', label: 'Points in a season' },
  { id: 'gamePoints', label: 'Points in a game' },
  { id: 'winStreak', label: 'Winning streak' }
];

/** The records book's choices, kept for the session so returning from a player page restores them. */
const choice: { view: View; stat: StatKey; teamRecord: TeamRecordId } = {
  view: 'game',
  stat: 'passYds',
  teamRecord: 'wins'
};

/** The player whose page was opened from the records book, and where the page was scrolled. */
let opened: { playerId: string; scroll: number } | null = null;

const teamCell = (abbr: TeamAbbr) => h('abbr', { title: teamFullName(abbr) }, abbr);

/** Ranks with ties shared, as record books print them: 1, T-2, T-2, 4. */
function ranks(entries: readonly RecordEntry[]): string[] {
  return entries.map(e => {
    const first = entries.findIndex(x => x.value === e.value);
    const tied = entries.filter(x => x.value === e.value).length > 1;
    return `${tied ? 'T-' : ''}${first + 1}`;
  });
}

/** The column naming when a record happened; player records put the team first. */
function whenLabel(view: View, teamRecord: TeamRecordId): string {
  if (view === 'career') return 'Team, last season';
  if (view === 'team') return teamRecord === 'winStreak' ? 'Began' : 'Season';
  return 'Team, season';
}

function entryTable(
  league: League,
  entries: readonly RecordEntry[],
  caption: string,
  view: View
): HTMLElement {
  const team = view === 'team';
  const rank = ranks(entries);
  const place = new Map(entries.map((e, i) => [e, i]));
  const player = (e: RecordEntry) => (e.playerId ? league.players[e.playerId] : undefined);
  const who = (e: RecordEntry): HTMLElement => {
    if (team) return h('th', { scope: 'row' }, teamFullName(e.team));
    const p = player(e);
    return h(
      'th',
      { scope: 'row' },
      p
        ? h('a', { href: href('player', { id: p.id }), 'data-player-link': p.id, on: { click: () => { opened = { playerId: p.id, scroll: window.scrollY }; } } }, fullName(p))
        : 'Former player'
    );
  };
  const columns: TableColumn<RecordEntry>[] = [
    { id: 'rank', label: 'Rank', name: 'rank', type: 'number', first: 'asc', words: ['top first', 'bottom first'], value: e => place.get(e), cell: e => h('td', null, rank[place.get(e) ?? 0] ?? '') },
    { id: 'who', label: team ? 'Team' : 'Player', name: team ? 'team' : 'player', type: 'text', value: e => { const p = player(e); return team ? teamFullName(e.team) : p ? `${p.lastName} ${p.firstName}` : null; }, cell: who },
    { id: 'when', label: whenLabel(view, choice.teamRecord), name: 'season', type: 'number', first: 'asc', value: e => e.season, cell: e => (team ? h('td', null, String(e.season)) : h('td', null, teamCell(e.team), ` ${e.season}`)) },
    { id: 'total', label: 'Total', name: 'total', type: 'number', numeric: true, value: e => e.value, cell: e => h('td', { class: 'num' }, formatStat(e.value, 'int')) }
  ];
  return sortableTable({ key: `records.${view}`, name: caption.toLowerCase(), caption, className: 'stat-table record-table', columns, rows: entries, rowId: e => String(place.get(e) ?? 0).padStart(3, '0'), defaultOrder: 'by rank', scroll: true }).element;
} // prettier-ignore

function recordsView(league: League, book: RecordsBook): { node: HTMLElement; restore(): void } {
  const scope = h(
    'select',
    { class: 'select', id: 'recordScope' },
    ...SCOPES.map(s => h('option', { value: s.id }, s.label))
  );
  const stat = h('select', { class: 'select', id: 'recordStat' });
  const body = h('div', { class: 'stack' });
  const status = h('p', { class: 'sr-only', role: 'status' });
  const fillStats = () => {
    if (choice.view === 'team') {
      mount(stat, ...TEAM_RECORDS.map(r => h('option', { value: r.id }, r.label)));
      stat.value = choice.teamRecord;
      return;
    }
    const view = choice.view;
    mount(
      stat,
      ...CATEGORY_IDS.flatMap(c => {
        const keys = CATEGORY_KEYS[c].filter(
          k => RECORD_STATS.includes(k) && (view === 'game' || !LONG_STATS.has(k))
        );
        const all: StatKey[] = [...(c === 'defense' ? (['tackles'] as const) : []), ...keys];
        return all.length
          ? [
              h(
                'optgroup',
                { label: CATEGORY_TITLES[c] },
                ...all.map(k => h('option', { value: k }, STAT_NAMES[k]))
              )
            ]
          : [];
      })
    );
    // A "longest" stat has only single-game records.
    if (![...stat.options].some(o => o.value === choice.stat)) choice.stat = 'passYds';
    stat.value = choice.stat;
  };
  const draw = (announce: boolean) => {
    const view = choice.view;
    const label = stat.selectedOptions[0]?.textContent ?? '';
    const scopeLabel = (SCOPES.find(x => x.id === view)?.label ?? '').toLowerCase();
    const entries = view === 'team' ? book.team[choice.teamRecord] : (book[view][choice.stat] ?? []);
    const caption = `${label}, ${scopeLabel}`;
    mount(
      body,
      entries.length
        ? entryTable(league, entries, caption, view)
        : h(
            'p',
            { class: 'empty' },
            view === 'team' ? 'No team record yet.' : `No player has recorded ${label.toLowerCase()} yet.`
          )
    );
    if (announce)
      status.textContent = `${caption}: ${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}.`;
  };
  scope.value = choice.view;
  scope.addEventListener('change', () => {
    choice.view = scope.value as View;
    fillStats();
    draw(true);
  });
  stat.addEventListener('change', () => {
    if (choice.view === 'team') choice.teamRecord = stat.value as TeamRecordId;
    else choice.stat = stat.value as StatKey;
    draw(true);
  });
  fillStats();
  draw(false);
  const node = h(
    'div',
    { class: 'stack' },
    h(
      'div',
      { class: 'filterbar' },
      h('div', { class: 'field' }, h('label', { for: 'recordScope' }, 'Records'), scope),
      h('div', { class: 'field' }, h('label', { for: 'recordStat' }, 'Stat'), stat)
    ),
    status,
    body
  );
  // Back from a player page: the same scroll position, with focus on that player's link.
  const restore = () => {
    const back = opened;
    opened = null;
    if (!back) return;
    const link = node.querySelector<HTMLElement>(`[data-player-link="${CSS.escape(back.playerId)}"]`);
    if (!link) return;
    window.scrollTo(0, back.scroll);
    link.focus({ preventScroll: true });
  };
  return { node, restore };
}

export function historyScreen(): Screen {
  return {
    title: 'History',
    render: ({ app, returning }) => {
      const league = app.league;
      if (!returning) opened = null;
      const body = h('div', { class: 'stack' }, h('p', { class: 'muted' }, 'Loading the records book…'));
      if (league)
        void app.store.history.records(league.meta.id).then(
          book => {
            const view = recordsView(league, book);
            mount(body, view.node);
            view.restore();
          },
          () =>
            mount(
              body,
              h(
                'p',
                { class: 'empty' },
                "The records book couldn't be read from this browser's storage. Reload the page to try again."
              )
            )
        );
      return h('section', { class: 'view' }, pageHead('History'), card('Records book', body));
    }
  };
}
