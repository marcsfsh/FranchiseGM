/**
 * Scouting and the draft class (spec 10.4). The big board ranks the class by the user's own grades, each
 * shown as the range it could still move, with how far the scouts have got and where the media project
 * him; Workouts lists the combine and pro day results; Scouts shows where the scouts work and the points
 * they've earned; and Mock draft shows the media's latest first round. With auto scouting off, the user
 * places the scouts, spends their points prospect by prospect, and makes the top-30 visits. Each prospect
 * opens a dialog with what the team has learned about him.
 */
import { teamFullName, type TeamAbbr } from '../../data/team-colors';
import type { DraftClass, Measurables, Prospect } from '../../engine/draft/class';
import {
  assignScout,
  classOutlook,
  errorScale,
  NATIONAL,
  REGIONS,
  scoutProblem,
  scoutProspect,
  scoutsItself,
  weeklyPoints
} from '../../engine/draft/scouting';
import { visit, visitProblem } from '../../engine/draft/workouts';
import { teamStaff } from '../../engine/league/fit';
import type { League } from '../../engine/league/types';
import { fullName } from '../../engine/model/player';
import { POSITION_GROUP, POSITIONS, type PositionGroup } from '../../engine/model/positions';
import { TUNING } from '../../engine/tuning';
import { h, mount } from '../dom';
import { actionDialogFrame, dialogFrame, openDialog, toast } from '../feedback';
import { focusKeyOf, visibleMatch } from '../focus';
import { ordinal } from '../format';
import { href } from '../router';
import type { AppState } from '../state';
import { weekLabel } from '../ui/games';
import { GROUP_LABELS, stat } from '../ui/players';
import {
  boardRows,
  DRILLS,
  gradeText,
  prospectDetails,
  rangeOf,
  roundText,
  scoutedText,
  unknownCell,
  type BoardRow
} from '../ui/prospects';
import { sortableTable, type SortableTable, type TableColumn } from '../ui/sortable';
import { tabs } from '../ui/tabs';
import { card, pageHead } from './common';
import type { Screen } from './types';

const S = TUNING.draft.scouting;
const PAGE = 40;
/** The top of the board the Scouts tab counts by region. */
const TOP = 100;
const INTERNATIONAL = 'international';

/** The screen's choices, kept while the user moves around the app: the tab, the filters, and each tab's page. */
const kept = {
  tab: 'scout-board',
  group: 'all' as PositionGroup | 'all',
  region: 'all',
  shown: { 'scout-board': PAGE, 'scout-workouts': PAGE } as Record<string, number>
};
/** The big board as last drawn, to find where its sort puts a prospect. */
let boardTable: SortableTable<BoardRow> | null = null;

/** A position group as a draft analyst says it: "deep at quarterback". */
const GROUP_ONE: Record<PositionGroup, string> = {
  QB: 'quarterback', RB: 'running back', WR: 'receiver', TE: 'tight end', OL: 'offensive line',
  DL: 'defensive line', LB: 'linebacker', DB: 'defensive back', ST: 'specialist'
}; // prettier-ignore

/** "A strong class, deep at quarterback and thin at tight end." */
function outlookText(draft: DraftClass): string {
  const o = classOutlook(draft);
  const whole = o.overall === 'strong' ? 'A strong class' : o.overall === 'weak' ? 'A weak class' : 'An average class';
  const parts = [o.deep ? `deep at ${GROUP_ONE[o.deep]}` : null, o.thin ? `thin at ${GROUP_ONE[o.thin]}` : null].filter(Boolean);
  return parts.length ? `${whole}, ${parts.join(' and ')}.` : `${whole}, with no position group standing out.`;
} // prettier-ignore

const regionOf = (p: Prospect): string => p.region ?? INTERNATIONAL;
const regionName = (region: string): string =>
  region === INTERNATIONAL ? 'International Player Pathway' : region;

export function scoutingScreen(): Screen {
  let off: (() => void) | null = null;
  return {
    title: 'Scouting and draft',
    dispose: () => off?.(),
    render: ({ app }) => {
      const view = h('section', { class: 'view' });
      if (!app.league) return view;
      // Rebuilds replace the content; the status stays put, so screen readers hear what changed.
      const content = h('div');
      const status = h('p', { class: 'sr-only', role: 'status' });
      view.append(content, status);
      let shownLeague: League | null = null;
      /** Rebuilds, then focuses the control `key` names, or `fallback`'s, when it's gone. */
      const rebuild = (key: string | null, fallback?: string): void => {
        build();
        if (!key) return;
        (visibleMatch(view, key) ?? (fallback ? visibleMatch(view, fallback) : null) ?? view.querySelector<HTMLElement>('h1'))?.focus(); // prettier-ignore
      };
      // A week played while the screen is open brings new points, grades, and news.
      off = app.onChange(() => {
        if (!app.league || app.league === shownLeague) return;
        rebuild(focusKeyOf(view));
      });

      const build = (): void => {
        const league = app.league;
        if (!league) return;
        shownLeague = league;
        const abbr = league.meta.start.userTeam;
        const draft = league.draft;
        const manual = !scoutsItself(league, abbr);
        mount(
          content,
          pageHead('Scouting and draft', draft ? `${draft.year} draft` : teamFullName(abbr)),
          h('div', { class: 'stack' }, summaryCard(app, league, abbr, draft, status, rebuild), draft ? scoutingTabs(app, league, abbr, draft, manual, view, status, rebuild) : null)
        ); // prettier-ignore
      };
      build();
      return view;
    }
  };
}

type Rebuild = (key: string | null, fallback?: string) => void;

/** The class at a glance, the auto scouting switch, and the points and visits the user has. */
function summaryCard(
  app: AppState,
  league: League,
  abbr: TeamAbbr,
  draft: DraftClass | null,
  status: HTMLElement,
  rebuild: Rebuild
): HTMLElement {
  const on = league.settings.auto.scouting;
  const toggle = h('button', { class: 'switch', type: 'button', role: 'switch', id: 'scoutingAuto', 'aria-checked': String(on), 'aria-labelledby': 'scoutingAuto-label', 'aria-describedby': 'scoutingAuto-hint' }); // prettier-ignore
  toggle.addEventListener('click', () => {
    const next = !(app.league ?? league).settings.auto.scouting;
    app.edit(
      l => {
        l.settings.auto.scouting = next;
      },
      ['auto', 'scouting', next]
    );
    rebuild('#scoutingAuto');
    status.textContent = next
      ? 'Auto scouting is on: your director of scouting places your scouts, spends their points, and makes your visits.'
      : 'Auto scouting is off: you place your scouts, spend their points, and make your visits.';
  });
  const switchRow = h(
    'div',
    null,
    h('div', { class: 'switch-row' }, h('span', { class: 'field-label', id: 'scoutingAuto-label' }, 'Auto scouting'), toggle),
    h('p', { class: 'muted', id: 'scoutingAuto-hint' }, on ? 'Your director of scouting places your scouts, spends their points on the prospects he grades highest, and makes your top-30 visits. Turn it off to do these yourself.' : 'You place your scouts, spend their points, and make your top-30 visits. Turn it on to hand them to your director of scouting.')
  ); // prettier-ignore
  const room = h(
    'div',
    { class: 'btn-row' },
    h('a', { class: 'btn btn-outline', href: href('draft') }, 'Draft room')
  );
  if (!draft) {
    const season = league.date.season;
    return card(
      'Your scouting',
      h('p', { class: 'empty' }, `No class to scout right now. The ${season + 2} draft class comes into view when the ${season + 1} regular season starts.`),
      switchRow,
      room
    ); // prettier-ignore
  }
  const scouting = draft.scouting[abbr];
  const onHand = Object.values(scouting.bank).reduce((sum, v) => sum + v, 0);
  const perWeek = teamStaff(league, abbr).reduce(
    (sum, s) => sum + (s.role === 'DOS' || (s.role === 'SCOUT' && s.region) ? weeklyPoints(s) : 0),
    0
  );
  const visitsOpen = draft.prospects.some(p => p.workout);
  const visits = scouting.visits.length;
  return card(
    'Your scouting',
    h('p', null, `${draft.prospects.length} prospects in the ${draft.year} class. ${outlookText(draft)}`),
    h('div', { class: 'stat-grid' }, stat('Points on hand', String(onHand)), stat('Points a week', String(perWeek)), stat('Top-30 visits', `${visits} of ${league.rules.season.draftVisits}`)),
    draft.board
      ? h('p', null, 'The draft is on, and your scouting is done. Make your picks in the Draft room.')
      : h('p', { class: 'hint' }, visitsOpen ? `Visits run from the combine to the draft. ${visits < league.rules.season.draftVisits ? `${league.rules.season.draftVisits - visits} left.` : 'All made.'}` : 'Top-30 visits open after the combine.'),
    switchRow,
    room
  ); // prettier-ignore
}

/** The big board, workouts, scouts, and mock draft tabs. */
function scoutingTabs(
  app: AppState,
  league: League,
  abbr: TeamAbbr,
  draft: DraftClass,
  manual: boolean,
  view: HTMLElement,
  status: HTMLElement,
  rebuild: Rebuild
): HTMLElement {
  const rows = boardRows(league, draft, abbr);
  const byId = new Map(rows.map(r => [r.player.id, r]));
  const visitsOpen = draft.prospects.some(p => p.workout);
  const visitsLeft = league.rules.season.draftVisits - draft.scouting[abbr].visits.length;
  /** Focuses the first visible control the keys name, else the page heading. */
  const focusOn = (...keys: string[]): void =>
    (keys.map(k => visibleMatch(view, k)).find(Boolean) ?? view.querySelector<HTMLElement>('h1'))?.focus();
  const keyOf = (kind: 'prospect' | 'scout' | 'visit', id: string) =>
    `[data-focus="${kind}-${CSS.escape(id)}"]`;
  /** Pages the board on far enough to show a prospect, wherever its sort puts him after a change. */
  const reveal = (id: string): void => {
    const at = boardTable?.rows().findIndex(r => r.player.id === id) ?? -1;
    const shown = kept.shown['scout-board'] ?? PAGE;
    if (at < shown) return;
    kept.shown['scout-board'] = Math.ceil((at + 1) / PAGE) * PAGE;
    rebuild(null);
  };
  /** A prospect's grade and place on the board now, for a message. */
  const standing = (id: string): string => {
    const now = app.league?.draft ? boardRows(app.league, app.league.draft, abbr).find(r => r.player.id === id) : undefined; // prettier-ignore
    if (!now) return '';
    const [low, high] = rangeOf(now.grade);
    return `${scoutedText(now.grade)} scouted. Your grade: ${low} to ${high}, ${ordinal(now.rank)} on your board.`;
  };

  /** The prospect details dialog; a scouting round or a visit there redraws the screen when it closes. */
  const openProspect = (id: string, trigger: HTMLElement): void => {
    const first = byId.get(id);
    if (!first) return;
    const name = fullName(first.player);
    const body = h('div', { class: 'stack' });
    // What an action did, or why it couldn't, stays in view in the footer beside the actions.
    const note = h('p', { class: 'hint', role: 'status' });
    const scoutButton = h('button', { class: 'btn btn-solid', type: 'button' }, `Scout ${name}`);
    const visitButton = h('button', { class: 'btn btn-outline', type: 'button' }, 'Bring him in for a visit');
    let changed = false;
    const dialog = manual
      ? actionDialogFrame('prospectDialog', name, [body], [note, scoutButton, visitButton])
      : dialogFrame('prospectDialog', name, body);
    const footer = dialog.querySelector<HTMLElement>('.dialog-actions');
    const close = dialog.querySelector<HTMLElement>('[data-close]');
    const draw = (message?: string) => {
      const now = app.league;
      const row = now?.draft ? boardRows(now, now.draft, abbr).find(r => r.player.id === id) : undefined;
      if (!now || !row) return;
      mount(body, ...prospectDetails(now, row, abbr));
      const left = now.rules.season.draftVisits - (now.draft?.scouting[abbr].visits.length ?? 0);
      scoutButton.hidden = row.grade.scouted >= 1;
      visitButton.hidden = row.visited || !visitsOpen || left <= 0;
      if (message !== undefined) note.textContent = message;
      if (footer) footer.hidden = scoutButton.hidden && visitButton.hidden && !note.textContent;
    };
    draw();
    scoutButton.addEventListener('click', () => {
      const problem = app.league ? scoutProblem(app.league, abbr, id) : null;
      if (problem) return draw(problem);
      app.edit(
        l => {
          scoutProspect(l, abbr, id);
        },
        ['scout', id]
      );
      changed = true;
      draw(standing(id));
      if (scoutButton.hidden) (visitButton.hidden ? close : visitButton)?.focus();
    });
    visitButton.addEventListener('click', () => {
      const problem = app.league ? visitProblem(app.league, abbr, id) : null;
      if (problem) return draw(problem);
      app.edit(
        l => {
          visit(l, abbr, id);
        },
        ['visit', id]
      );
      changed = true;
      draw(`${name} came in for a visit. His character is under Character.`);
      (scoutButton.hidden ? close : scoutButton)?.focus();
    });
    document.getElementById('prospectDialog')?.remove();
    document.body.append(dialog);
    dialog.addEventListener('close', () => {
      window.setTimeout(() => dialog.remove(), 0);
      if (!changed) return;
      rebuild(null);
      reveal(id);
    });
    openDialog(dialog, trigger, () => visibleMatch(view, keyOf('prospect', id)));
  };

  const nameButton = (row: BoardRow): HTMLElement => {
    const button = h('button', { class: 'btn btn-text prospect-name', type: 'button', 'aria-haspopup': 'dialog', 'data-focus': `prospect-${row.player.id}` }, fullName(row.player)); // prettier-ignore
    button.addEventListener('click', () => openProspect(row.player.id, button));
    return button;
  };

  /**
   * Spends a round of points from a board row. His new grade can move him on the board, so the board pages
   * on to wherever he lands, and focus stays on his row.
   */
  const scoutRow = (row: BoardRow): void => {
    const id = row.player.id;
    const problem = app.league ? scoutProblem(app.league, abbr, id) : null;
    if (problem) {
      toast(problem, { persistent: true });
      return;
    }
    app.edit(l => {
      scoutProspect(l, abbr, id);
    }, ['scout', id]);
    rebuild(null);
    reveal(id);
    focusOn(keyOf('scout', id), keyOf('prospect', id));
    status.textContent = `${fullName(row.player)}: ${standing(id)}`;
  }; // prettier-ignore

  const visitRow = (row: BoardRow): void => {
    const id = row.player.id;
    const problem = app.league ? visitProblem(app.league, abbr, id) : null;
    if (problem) {
      toast(problem, { persistent: true });
      return;
    }
    app.edit(
      l => {
        visit(l, abbr, id);
      },
      ['visit', id]
    );
    rebuild(null);
    focusOn(keyOf('scout', id), keyOf('prospect', id));
    const used = app.league?.draft?.scouting[abbr].visits.length ?? 0;
    status.textContent = `${fullName(row.player)} came in for a visit. ${used} of ${league.rules.season.draftVisits} visits made.`;
  };

  // Each call makes fresh controls: the table and the phone list both show them.
  const actions = (row: BoardRow): HTMLElement | null => {
    if (!manual) return null;
    const name = fullName(row.player);
    const scout = row.grade.scouted < 1 ? h('button', { class: 'btn btn-outline', type: 'button', 'aria-label': `Scout ${name}`, 'data-focus': `scout-${row.player.id}` }, 'Scout') : null; // prettier-ignore
    scout?.addEventListener('click', () => scoutRow(row));
    const visiting = visitsOpen && visitsLeft > 0 && !row.visited ? h('button', { class: 'btn btn-outline', type: 'button', 'aria-label': `Bring ${name} in for a visit`, 'data-focus': `visit-${row.player.id}` }, 'Visit') : null; // prettier-ignore
    visiting?.addEventListener('click', () => visitRow(row));
    return scout || visiting ? h('div', { class: 'btn-row' }, scout, visiting) : null;
  };

  /** The position and region filters, shared by the board and the workouts. */
  const filtered = (list: readonly BoardRow[]) =>
    list.filter(r => (kept.group === 'all' || POSITION_GROUP[r.player.position] === kept.group) && (kept.region === 'all' || regionOf(r.prospect) === kept.region)); // prettier-ignore
  const filterBar = (): HTMLElement => {
    const group = h('select', { class: 'select', id: 'scout-group' }, h('option', { value: 'all' }, 'All positions'), ...(Object.keys(GROUP_LABELS) as PositionGroup[]).map(g => h('option', { value: g }, GROUP_LABELS[g]))); // prettier-ignore
    group.value = kept.group;
    const region = h('select', { class: 'select', id: 'scout-region' }, h('option', { value: 'all' }, 'All regions'), ...[...REGIONS, INTERNATIONAL].map(r => h('option', { value: r }, regionName(r)))); // prettier-ignore
    region.value = kept.region;
    const change = (id: string) => () => {
      kept.group = group.value as PositionGroup | 'all';
      kept.region = region.value;
      kept.shown = { 'scout-board': PAGE, 'scout-workouts': PAGE };
      rebuild(`#${id}`);
      status.textContent = view.querySelector('.scout-count')?.textContent ?? '';
    };
    group.addEventListener('change', change('scout-group'));
    region.addEventListener('change', change('scout-region'));
    return h('div', { class: 'filterbar' }, h('div', { class: 'field' }, h('label', { for: 'scout-group' }, 'Position'), group), h('div', { class: 'field' }, h('label', { for: 'scout-region' }, 'Region'), region)); // prettier-ignore
  };
  const countText = (n: number, what: string): string => {
    const where = [kept.group === 'all' ? null : `among the ${GROUP_LABELS[kept.group].toLowerCase()}`, kept.region === 'all' ? null : kept.region === INTERNATIONAL ? 'from the International Player Pathway' : `in the ${kept.region}`].filter(Boolean); // prettier-ignore
    return `${n} ${what}${where.length ? ` ${where.join(' ')}` : ''}.`;
  };

  /** The button that shows the next page of a paged tab, focusing the first new row; null on the last page. */
  const showMore = (tab: string, total: number): HTMLElement | null => {
    const page = kept.shown[tab] ?? PAGE;
    if (total <= page) return null;
    const more = h('button', { class: 'btn btn-outline', type: 'button', 'data-focus': 'scout-more' }, `Show ${Math.min(PAGE, total - page)} more`); // prettier-ignore
    more.addEventListener('click', () => {
      kept.shown[tab] = page + PAGE;
      rebuild(null);
      [...view.querySelectorAll<HTMLElement>('.prospect-name')].filter(b => b.getClientRects().length > 0).at(page)?.focus(); // prettier-ignore
    });
    return more;
  };

  const board = (): HTMLElement => {
    const shown = filtered(rows);
    const columns: TableColumn<BoardRow>[] = [
      { id: 'rank', label: 'Rank', title: 'Rank on your board', name: 'rank on your board', type: 'number', first: 'asc', words: ['best first', 'worst first'], numeric: true, className: 'wide rank-col', value: r => r.rank, cell: r => h('td', { class: 'wide num' }, r.rank) },
      { id: 'position', label: 'Pos', title: 'Position', name: 'position', type: 'number', first: 'asc', words: ['quarterbacks first', 'specialists first'], className: 'pos-col', value: r => POSITIONS.indexOf(r.player.position), cell: r => h('td', null, r.player.position) },
      { id: 'prospect', label: 'Prospect', name: 'prospect', type: 'text', value: r => `${r.player.lastName} ${r.player.firstName}`, cell: r => h('th', { scope: 'row' }, nameButton(r), r.visited ? h('span', { class: 'chip' }, 'Visited') : null) },
      { id: 'college', label: 'College', name: 'college', type: 'text', className: 'widest college-col', value: r => r.player.college, cell: r => h('td', { class: 'widest' }, r.player.college) },
      { id: 'age', label: 'Age', name: 'age', type: 'number', numeric: true, className: 'age-col', value: r => r.age, cell: r => h('td', { class: 'num' }, r.age) },
      { id: 'grade', label: 'Grade', title: 'Your grade', name: 'your grade', type: 'number', numeric: true, className: 'grade-col', value: r => r.grade.value, cell: r => h('td', { class: 'num' }, gradeText(r.grade)) },
      { id: 'scouted', label: 'Scouted', name: 'scouted', type: 'number', numeric: true, className: 'scouted-col', value: r => r.grade.scouted, cell: r => h('td', { class: 'num' }, scoutedText(r.grade)) },
      { id: 'media', label: 'Media', title: "Media projection, by the media's big board", name: 'media projection', type: 'number', first: 'asc', words: ['earliest first', 'latest first'], className: 'wide round-col', value: r => r.media, cell: r => h('td', { class: 'wide' }, roundText(r.round)) },
      { id: 'forty', label: '40', title: '40-yard dash, seconds', name: '40-yard dash', type: 'number', first: 'asc', words: ['fastest first', 'slowest first'], numeric: true, className: 'widest forty-col', value: r => r.prospect.measurables?.forty, cell: r => h('td', { class: 'widest num' }, r.prospect.measurables ? r.prospect.measurables.forty.toFixed(2) : unknownCell('Not measured')) },
      ...(manual ? [{ id: 'actions', label: 'Scouting', name: 'scouting', type: 'custom' as const, sortable: false, hideLabel: true, className: 'scout-actions-col', cell: (r: BoardRow) => h('td', null, actions(r)) }] : [])
    ]; // prettier-ignore
    const list = h('ul', { class: 'roster-list', 'aria-label': 'Prospects' });
    const items = new Map<string, HTMLElement>();
    const item = (r: BoardRow): HTMLElement => {
      let li = items.get(r.player.id);
      if (!li) {
        li = h('li', { class: 'list-row' }, h('span', { class: 'pos' }, r.player.position), h('div', { class: 'list-main' }, nameButton(r), h('p', { class: 'list-sub' }, `${r.rank}. ${r.player.college} · Age ${r.age} · ${scoutedText(r.grade)} scouted · Media: ${roundText(r.round).toLowerCase()}${r.visited ? ' · Visited' : ''}`)), h('div', { class: 'stat' }, h('span', { class: 'label' }, 'Grade'), h('span', { class: 'value' }, gradeText(r.grade))), actions(r)); // prettier-ignore
        items.set(r.player.id, li);
      }
      return li;
    };
    const page = kept.shown['scout-board'] ?? PAGE;
    const table = shown.length
      ? sortableTable({ key: 'scouting.board', name: 'big board', caption: 'Your big board', captionClass: 'sr-only', className: 'roster-table scout-table', columns, rows: shown, rowId: r => r.player.id, defaultOrder: 'by your grade, best first', status, limit: page, onSort: ordered => list.replaceChildren(...ordered.map(item)) }) // prettier-ignore
      : null;
    boardTable = table;
    const more = showMore('scout-board', shown.length);
    return h(
      'div',
      { class: 'stack' },
      filterBar(),
      h('p', { class: 'scout-count' }, countText(shown.length, shown.length === 1 ? 'prospect' : 'prospects')),
      h('p', { class: 'hint' }, manual ? `Scout spends up to ${S.spendEach} points on a prospect: first from his region's scouts, then from your director's. Each round narrows your grade. Your scouts learn his traits at ${Math.round((S.traitsAt / S.fullPoints) * 100)}% scouted and his abilities at 100%.` : 'Your director of scouting is spending your points on the prospects he grades highest. Turn off auto scouting to choose them yourself.'),
      table ? h('div', { class: 'roster-region' }, table.element, list) : h('p', { class: 'empty' }, 'No prospects match. Choose another position or region to see the rest of the class.'),
      more
    ); // prettier-ignore
  };

  const workouts = (): HTMLElement => {
    const done = filtered(rows).filter(r => r.prospect.measurables);
    if (!draft.prospects.some(p => p.measurables))
      return h('p', { class: 'empty' }, 'No workouts yet. The combine comes after the re-sign window in the offseason, and pro days after free agency. Results show here as prospects work out.'); // prettier-ignore
    const measured = (r: BoardRow) => r.prospect.measurables as Measurables;
    const columns: TableColumn<BoardRow>[] = [
      { id: 'position', label: 'Pos', title: 'Position', name: 'position', type: 'number', first: 'asc', words: ['quarterbacks first', 'specialists first'], value: r => POSITIONS.indexOf(r.player.position), cell: r => h('td', null, r.player.position) },
      { id: 'prospect', label: 'Prospect', name: 'prospect', type: 'text', value: r => `${r.player.lastName} ${r.player.firstName}`, cell: r => h('th', { scope: 'row' }, nameButton(r)) },
      { id: 'where', label: 'Where', name: 'where he worked out', type: 'text', value: r => (r.prospect.workout === 'combine' ? 'Combine' : 'Pro day'), cell: r => h('td', null, r.prospect.workout === 'combine' ? 'Combine' : 'Pro day') },
      ...DRILLS.map(d => ({ id: d.key, label: d.label, title: d.title, name: d.title.replace(/,.*$/, '').toLowerCase(), type: 'number' as const, numeric: true, ...(d.timed ? { first: 'asc' as const, words: ['fastest first', 'slowest first'] as const } : {}), value: (r: BoardRow) => measured(r)[d.key], cell: (r: BoardRow) => h('td', { class: 'num' }, d.cell(measured(r)[d.key])) }))
    ]; // prettier-ignore
    const table = done.length
      ? sortableTable({ key: 'scouting.workouts', name: 'workout results', caption: 'Workout results', captionClass: 'sr-only', className: 'stat-table', columns, rows: done, rowId: r => r.player.id, defaultOrder: 'by your grade, best first', scroll: true, status, limit: kept.shown['scout-workouts'] ?? PAGE }) // prettier-ignore
      : null;
    const more = showMore('scout-workouts', done.length);
    return h(
      'div',
      { class: 'stack' },
      filterBar(),
      h('p', { class: 'scout-count' }, countText(done.length, done.length === 1 ? 'prospect worked out' : 'prospects worked out')),
      table ? table.element : h('p', { class: 'empty' }, 'No one here has worked out yet. Choose another position or region to see the rest.'),
      more
    ); // prettier-ignore
  };

  const scouts = (): HTMLElement => {
    const staff = teamStaff(league, abbr);
    const director = staff.find(s => s.role === 'DOS');
    const team = staff.filter(s => s.role === 'SCOUT');
    const bank = draft.scouting[abbr].bank;
    const scale = errorScale(league, abbr);
    const width = Math.round(Math.abs(1 - scale) * 100);
    const accuracy =
      width === 0
        ? "as wide as an average department's"
        : `${width}% ${scale < 1 ? 'narrower' : 'wider'} than an average department's`;
    // National scouts' points go anywhere, as the director's do.
    const national = team.filter(s => s.region === NATIONAL).reduce((sum, s) => sum + weeklyPoints(s), 0);
    const directorText = director
      ? `${fullName(director)} is your director of scouting. He earns ${weeklyPoints(director)} points a week for any prospect,${national ? ` your national scouts ${national} more,` : ''} and ${bank[NATIONAL] ?? 0} are on hand. With his accuracy (${director.ratings.accuracy ?? 50}), your grades' ranges run ${accuracy}.`
      : national
        ? `You have no director of scouting. Your national scouts earn ${national} points a week for any prospect, and ${bank[NATIONAL] ?? 0} are on hand.`
        : 'You have no director of scouting, so no points come in for prospects outside your scouts\' regions.'; // prettier-ignore
    const staffColumns: TableColumn<(typeof team)[number]>[] = [
      { id: 'scout', label: 'Scout', name: 'scout', type: 'text', value: s => `${s.lastName} ${s.firstName}`, cell: s => h('th', { scope: 'row' }, fullName(s)) },
      { id: 'points', label: 'Points a week', name: 'points a week', type: 'number', numeric: true, value: s => weeklyPoints(s), cell: s => h('td', { class: 'num' }, weeklyPoints(s)) },
      {
        id: 'region', label: 'Region', name: 'region', type: 'text', value: s => s.region ?? '',
        cell: s => {
          if (!manual) return h('td', null, s.region ?? unknownCell('No region'));
          const select = h('select', { class: 'select', id: `scout-${s.id}`, 'aria-label': `${fullName(s)}'s region` }, ...[...REGIONS, NATIONAL].map(r => h('option', { value: r }, r)));
          select.value = s.region ?? '';
          select.addEventListener('change', () => {
            const region = select.value;
            app.edit(l => {
              assignScout(l, abbr, s.id, region);
            }, ['assignScout', s.id, region]);
            rebuild(`#scout-${CSS.escape(s.id)}`);
            status.textContent = region === NATIONAL ? `${fullName(s)} now scouts nationally, for ${weeklyPoints({ ...s, region })} points a week.` : `${fullName(s)} now scouts the ${region}.`;
          });
          return h('td', null, select);
        }
      }
    ]; // prettier-ignore
    const top = new Set(rows.slice(0, TOP).map(r => r.player.id));
    const regions = [...REGIONS, INTERNATIONAL].map(region => {
      const here = team.filter(s => s.region === region);
      const prospects = draft.prospects.filter(p => regionOf(p) === region);
      return { region, scouts: here.length, perWeek: here.reduce((sum, s) => sum + weeklyPoints(s), 0), onHand: region === INTERNATIONAL ? null : (bank[region] ?? 0), prospects: prospects.length, top: prospects.filter(p => top.has(p.player.id)).length }; // prettier-ignore
    });
    type RegionRow = (typeof regions)[number];
    const regionColumns: TableColumn<RegionRow>[] = [
      { id: 'region', label: 'Region', name: 'region', type: 'text', value: r => regionName(r.region), cell: r => h('th', { scope: 'row' }, regionName(r.region)) },
      { id: 'scouts', label: 'Scouts', name: 'scouts', type: 'number', numeric: true, value: r => r.scouts, cell: r => h('td', { class: 'num' }, r.scouts) },
      { id: 'perWeek', label: 'Points a week', name: 'points a week', type: 'number', numeric: true, value: r => r.perWeek, cell: r => h('td', { class: 'num' }, r.perWeek) },
      { id: 'onHand', label: 'On hand', title: 'Points on hand', name: 'points on hand', type: 'number', numeric: true, value: r => r.onHand, cell: r => h('td', { class: 'num' }, r.onHand ?? unknownCell('Scouted with your director\'s points')) },
      { id: 'prospects', label: 'Prospects', name: 'prospects', type: 'number', numeric: true, value: r => r.prospects, cell: r => h('td', { class: 'num' }, r.prospects) },
      { id: 'top', label: `Your top ${TOP}`, name: `prospects in your top ${TOP}`, type: 'number', numeric: true, value: r => r.top, cell: r => h('td', { class: 'num' }, r.top) }
    ]; // prettier-ignore
    return h(
      'div',
      { class: 'stack' },
      h('p', null, directorText),
      h('h2', null, 'Scouts'),
      h('p', { class: 'hint' }, manual ? `Each scout earns points every week for prospects in his region. Send scouts where the prospects you want to know more about are, or national, for ${Math.round(S.nationalShare * 100)}% of his points to spend on anyone.` : 'Your director of scouting sends your scouts where his best-graded prospects are. Turn off auto scouting to place them yourself.'),
      team.length ? sortableTable({ key: 'scouting.scouts', name: 'scouts', caption: 'Your scouts', captionClass: 'sr-only', className: 'stat-table', columns: staffColumns, rows: team, rowId: s => s.id, defaultOrder: 'as they were hired', scroll: true, status }).element : h('p', { class: 'empty' }, 'You have no scouts.'),
      h('h2', null, 'Regions'),
      sortableTable({ key: 'scouting.regions', name: 'regions', caption: 'Scouting regions', captionClass: 'sr-only', className: 'stat-table', columns: regionColumns, rows: regions, rowId: r => r.region, defaultOrder: 'by region', scroll: true, status }).element
    ); // prettier-ignore
  };

  const mock = (): HTMLElement => {
    const latest = draft.mock;
    if (!latest)
      return h('p', { class: 'empty' }, `The first mock draft comes out after week ${TUNING.draft.media.mocksFrom}. A new one follows every week until the draft.`); // prettier-ignore
    const picks = latest.picks.flatMap(p => {
      const row = byId.get(p.prospectId);
      return row ? [{ pick: p, row }] : [];
    });
    type MockRow = (typeof picks)[number];
    const teamText = (m: MockRow) =>
      `${teamFullName(m.pick.team)}${m.pick.team === abbr ? ' (your pick)' : ''}`;
    const columns: TableColumn<MockRow>[] = [
      { id: 'pick', label: 'Pick', name: 'pick', type: 'number', first: 'asc', words: ['first pick first', 'last pick first'], numeric: true, className: 'rank-col', value: m => m.pick.number, cell: m => h('td', { class: 'num' }, m.pick.number) },
      { id: 'team', label: 'Team', name: 'team', type: 'text', value: m => teamFullName(m.pick.team), cell: m => h('td', null, teamText(m)) },
      { id: 'position', label: 'Pos', title: 'Position', name: 'position', type: 'number', first: 'asc', words: ['quarterbacks first', 'specialists first'], className: 'pos-col', value: m => POSITIONS.indexOf(m.row.player.position), cell: m => h('td', null, m.row.player.position) },
      { id: 'prospect', label: 'Prospect', name: 'prospect', type: 'text', value: m => `${m.row.player.lastName} ${m.row.player.firstName}`, cell: m => h('th', { scope: 'row' }, nameButton(m.row)) },
      { id: 'college', label: 'College', name: 'college', type: 'text', className: 'wide college-col', value: m => m.row.player.college, cell: m => h('td', { class: 'wide' }, m.row.player.college) },
      { id: 'grade', label: 'Your grade', name: 'your grade', type: 'number', numeric: true, className: 'grade-col', value: m => m.row.grade.value, cell: m => h('td', { class: 'num' }, gradeText(m.row.grade)) }
    ]; // prettier-ignore
    const list = h('ol', { class: 'roster-list', 'aria-label': 'Mock draft' });
    const items = new Map<string, HTMLElement>();
    const item = (m: MockRow): HTMLElement => {
      let li = items.get(m.row.player.id);
      if (!li) {
        li = h('li', { class: 'list-row' }, h('span', { class: 'pos' }, m.row.player.position), h('div', { class: 'list-main' }, h('p', { class: 'list-sub' }, `${m.pick.number}. ${teamText(m)}`), nameButton(m.row), h('p', { class: 'list-sub' }, m.row.player.college)), h('div', { class: 'stat' }, h('span', { class: 'label' }, 'Your grade'), h('span', { class: 'value' }, gradeText(m.row.grade)))); // prettier-ignore
        items.set(m.row.player.id, li);
      }
      return li;
    };
    return h(
      'div',
      { class: 'stack' },
      h('p', null, "The media's latest mock draft of the first round. It projects each team's pick by its needs and its own grades."),
      h('p', { class: 'hint' }, `Published: ${weekLabel(league, latest.week)}.`),
      h('div', { class: 'roster-region' }, sortableTable({ key: 'scouting.mock', name: 'mock draft', caption: 'Mock draft', captionClass: 'sr-only', className: 'roster-table mock-table', columns, rows: picks, rowId: m => m.row.player.id, defaultOrder: 'in pick order', status, onSort: ordered => list.replaceChildren(...ordered.map(item)) }).element, list)
    ); // prettier-ignore
  };

  const panels = tabs(
    'Scouting',
    [
      { id: 'scout-board', label: 'Big board', render: board },
      { id: 'scout-workouts', label: 'Workouts', render: workouts },
      { id: 'scout-staff', label: 'Scouts', render: scouts },
      { id: 'scout-mock', label: 'Mock draft', render: mock }
    ],
    kept.tab,
    id => (kept.tab = id)
  );
  return panels.element;
}
