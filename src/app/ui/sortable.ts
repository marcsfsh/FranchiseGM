/**
 * The shared sortable table (post-M23 section 1.2, style guide 7.3). Every data table sorts by any column
 * and by up to four at once. A header's button sorts by its column alone, and again reverses it; with Shift
 * it adds the column as the next level. The Sort control opens a panel listing the levels, where they're
 * added, removed, reversed, and reordered by keyboard or touch, and Reset sort returns the table's own
 * order. Each change is announced, aria-sort marks only the leading column, and a table's sort is
 * remembered through the visit.
 */
import { h } from '../dom';
import { icon } from '../icons';
import {
  addLevel,
  describeSort,
  dirWords,
  firstDir,
  MAX_LEVELS,
  moveLevel,
  pressHeader,
  sortRows,
  type SortDir,
  type SortKey,
  type SortLevel
} from './sort-rows';
import { scrollRegion } from './stat-table';

export interface TableColumn<Row> extends SortKey<Row> {
  /** The header's text; `title` is the full name when that text is abbreviated. */
  label: string;
  title?: string;
  /** Numbers align right. */
  numeric?: boolean;
  /** Classes for the column's header, such as a width or a column hidden on phones. */
  className?: string;
  /** False for columns that don't sort, such as row actions. */
  sortable?: boolean;
  /** A header only assistive technology reads, for a column whose cells speak for themselves. */
  hideLabel?: boolean;
  /** The row's cell: a th for the row header, a td otherwise. */
  cell: (row: Row) => HTMLElement;
}

export interface SortableTableOptions<Row> {
  /** Where the table's sort is remembered for the visit, like "roster". */
  key: string;
  /** The table in words, for its Sort control: "roster", "AFC East standings". */
  name: string;
  caption: string;
  captionClass?: string;
  className?: string;
  columns: readonly TableColumn<Row>[];
  /** The rows in the table's own order, which ties fall back to and Reset sort returns to. */
  rows: readonly Row[];
  rowId: (row: Row) => string;
  rowAttrs?: (row: Row) => Record<string, string | boolean | null>;
  /** How the table's own order reads after "Sorted": "by rank", "in tiebreaker order". */
  defaultOrder?: string;
  /**
   * Headings over groups of rows, such as a roster's reserve lists, while the table is in its own order
   * (its rows arrive group by group). A sort by column lists every row together.
   */
  group?: { of: (row: Row) => string; heading: (group: string, count: number) => string };
  foot?: HTMLElement | null;
  /** Wide tables scroll inside a region named by the caption (style guide 7.3). */
  scroll?: boolean;
  /** The screen's polite status region; the table makes its own when there's none. */
  status?: HTMLElement;
  /** Called with the rows shown, in order, after every sort, for a phone list drawn from the same rows. */
  onSort?: (rows: readonly Row[]) => void;
  /** Only this many rows show, taken after sorting: a page at a time of a long list. */
  limit?: number;
}

export interface SortableTable<Row> {
  element: HTMLElement;
  table: HTMLTableElement;
  /** The rows in their current order. */
  rows(): readonly Row[];
}

/** Each table's sort, kept through the visit alongside the screens' other remembered choices. */
const memory = new Map<string, SortLevel[]>();
let tables = 0;

const ORDINALS = ['first', 'second', 'third', 'fourth'];
const capital = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

export function sortableTable<Row>(o: SortableTableOptions<Row>): SortableTable<Row> {
  const uid = `sort${++tables}`;
  const keys = o.columns.filter(c => c.sortable !== false);
  const known = new Set(keys.map(k => k.id));
  let levels: SortLevel[] = (memory.get(o.key) ?? []).filter(l => known.has(l.column));
  let sorted: readonly Row[] = o.rows;
  const defaultOrder = o.defaultOrder ?? "in the table's own order";
  const status = o.status ?? h('p', { class: 'sr-only', role: 'status' });

  // Rows are built once and moved when the order changes, so what's inside them keeps its state.
  const rowOf = new Map<string, HTMLTableRowElement>();
  for (const row of o.rows)
    rowOf.set(o.rowId(row), h('tr', o.rowAttrs?.(row) ?? null, ...o.columns.map(c => c.cell(row))));

  // Headers: a button for each sortable column, with its direction and level shown beside the name and
  // described to assistive technology (aria-sort marks only the leading column).
  const heads = new Map<string, { th: HTMLTableCellElement; mark: HTMLElement; note: HTMLElement }>();
  const headRow = h('tr');
  for (const c of o.columns) {
    const className = [c.numeric ? 'num' : null, c.className ?? null].filter(Boolean).join(' ') || null;
    const name = c.hideLabel
      ? [h('span', { class: 'sr-only' }, c.title ?? c.label)]
      : c.title
        ? [h('span', { 'aria-hidden': 'true' }, c.label), h('span', { class: 'sr-only' }, c.title)]
        : [c.label];
    if (c.sortable === false) {
      headRow.append(h('th', { scope: 'col', class: className }, ...name));
      continue;
    }
    const mark = h('span', { class: 'sort-mark', 'aria-hidden': 'true' });
    const note = h('span', { id: `${uid}-note-${c.id}`, hidden: true });
    const button = h(
      'button',
      { type: 'button', class: 'sort-btn', 'aria-describedby': note.id },
      ...name,
      mark
    );
    button.addEventListener('click', event => {
      const next = event.shiftKey ? addLevel(levels, c) : pressHeader(levels, c);
      if (next) change(next);
      else
        status.textContent = `A table sorts by up to ${MAX_LEVELS} columns. Remove one in Sort to add another.`;
    });
    const th = h('th', { scope: 'col', class: className }, button, note);
    heads.set(c.id, { th, mark, note });
    headRow.append(th);
  }

  const table = h(
    'table',
    { class: o.className ?? null },
    h('caption', { class: o.captionClass ?? null }, o.caption),
    h('thead', null, headRow),
    o.foot ?? null
  );
  const shownRows = (): readonly Row[] => (o.limit === undefined ? sorted : sorted.slice(0, o.limit));
  const rowsOf = (list: readonly Row[]) => list.map(row => rowOf.get(o.rowId(row)) as HTMLTableRowElement);
  /** The table's bodies: one per group with its heading in the table's own order, otherwise one. */
  const bodies = (): HTMLTableSectionElement[] => {
    const group = o.group;
    if (levels.length || !group) return [h('tbody', null, ...rowsOf(shownRows()))];
    const groups = new Map<string, Row[]>();
    for (const row of shownRows()) groups.set(group.of(row), [...(groups.get(group.of(row)) ?? []), row]);
    return [...groups].map(([name, list]) =>
      h('tbody', null, h('tr', { class: 'group-row' }, h('th', { scope: 'rowgroup', colspan: String(o.columns.length) }, group.heading(name, list.length))), ...rowsOf(list))
    );
  }; // prettier-ignore

  // The Sort control and its panel.
  const toggle = h(
    'button',
    { type: 'button', class: 'btn btn-outline sort-toggle', 'aria-expanded': 'false', 'aria-controls': `${uid}-panel`, 'aria-label': `Sort ${o.name}` },
    icon('sort', { size: 18 }),
    'Sort'
  ); // prettier-ignore
  const summary = h('span', { class: 'sort-summary muted' });
  const list = h('ol', { class: 'sort-levels' });
  const add = h(
    'button',
    { type: 'button', class: 'btn btn-outline', id: `${uid}-add` },
    'Add a sort column'
  );
  const reset = h('button', { type: 'button', class: 'btn btn-outline', id: `${uid}-reset` }, 'Reset sort');
  const done = h('button', { type: 'button', class: 'btn btn-primary' }, 'Done');
  const panel = h(
    'div',
    {
      class: 'sort-panel',
      id: `${uid}-panel`,
      role: 'group',
      'aria-labelledby': `${uid}-title`,
      hidden: true
    },
    h('p', { class: 'field-label', id: `${uid}-title` }, `Sort ${o.name}`),
    list,
    h('div', { class: 'btn-row' }, add, reset, done)
  );
  const open = (show: boolean) => {
    panel.hidden = !show;
    toggle.setAttribute('aria-expanded', String(show));
  };
  toggle.addEventListener('click', () => {
    open(panel.hidden !== false);
    if (!panel.hidden) panel.querySelector<HTMLElement>('select, button')?.focus();
  });
  done.addEventListener('click', () => {
    open(false);
    toggle.focus();
  });
  panel.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    open(false);
    toggle.focus();
  });
  add.addEventListener('click', () => {
    const free = keys.find(k => !levels.some(l => l.column === k.id));
    if (!free || levels.length >= MAX_LEVELS) return;
    change([...levels, { column: free.id, dir: firstDir(free) }], `${uid}-col-${levels.length}`);
  });
  reset.addEventListener('click', () => change([], `${uid}-reset`));

  /** The panel's rows, one per level, with every control reachable by keyboard and touch. */
  const drawLevels = () => {
    list.replaceChildren(
      ...levels.map((level, i) => {
        const key = keys.find(k => k.id === level.column) as SortKey<Row>;
        const column = h(
          'select',
          { class: 'select', id: `${uid}-col-${i}`, 'aria-label': `${i === 0 ? 'Sort by' : 'Then by'}, ${ORDINALS[i]} column` },
          ...keys.map(k => h('option', { value: k.id, selected: k.id === level.column }, capital(k.name)))
        ); // prettier-ignore
        column.addEventListener('change', () => {
          const next = keys.find(k => k.id === column.value);
          if (!next) return;
          // A column appears once: choosing one already sorted moves it here.
          const others = levels.filter((l, j) => j !== i && l.column !== next.id);
          others.splice(Math.min(i, others.length), 0, { column: next.id, dir: firstDir(next) });
          change(others, `${uid}-col-${Math.min(i, others.length - 1)}`);
        });
        const dirs: SortDir[] = [firstDir(key), firstDir(key) === 'asc' ? 'desc' : 'asc'];
        const direction = h(
          'select',
          { class: 'select', id: `${uid}-dir-${i}`, 'aria-label': `Direction for ${key.name}` },
          ...dirs.map(d => h('option', { value: d, selected: d === level.dir }, capital(dirWords(key, d))))
        );
        direction.addEventListener('change', () =>
          change(
            levels.map((l, j) => (j === i ? { ...l, dir: direction.value as SortDir } : l)),
            `${uid}-dir-${i}`
          )
        );
        const move = (by: -1 | 1, name: string) => {
          const button = h(
            'button',
            { type: 'button', class: 'icon-btn', id: `${uid}-${name}-${i}`, 'aria-label': `Move ${key.name} ${name}`, disabled: by === -1 ? i === 0 : i === levels.length - 1 },
            icon(by === -1 ? 'arrowUp' : 'arrowDown', { size: 18, stroke: 2.5 })
          ); // prettier-ignore
          button.addEventListener('click', () => {
            const to = i + by;
            // Focus follows the level; at the end of the list it moves to the other button.
            const end = by === -1 ? to === 0 : to === levels.length - 1;
            change(moveLevel(levels, i, by), `${uid}-${end ? (by === -1 ? 'down' : 'up') : name}-${to}`);
          });
          return button;
        };
        const remove = h(
          'button',
          {
            type: 'button',
            class: 'btn btn-outline',
            id: `${uid}-remove-${i}`,
            'aria-label': `Remove ${key.name}`
          },
          'Remove'
        );
        remove.addEventListener('click', () => {
          const next = levels.filter((_, j) => j !== i);
          change(next, next.length ? `${uid}-remove-${Math.min(i, next.length - 1)}` : `${uid}-add`);
        });
        return h(
          'li',
          { class: 'sort-level' },
          h('span', { class: 'sort-level-n' }, i === 0 ? 'Sort by' : 'Then by'),
          h('div', { class: 'sort-level-pick' }, column, direction),
          h('div', { class: 'sort-level-moves' }, move(-1, 'up'), move(1, 'down'), remove)
        );
      })
    );
    if (!levels.length) list.append(h('li', { class: 'sort-level muted' }, capital(`${defaultOrder}.`)));
    add.disabled = levels.length >= MAX_LEVELS || levels.length >= keys.length;
    reset.disabled = levels.length === 0;
  };

  /** Puts the rows in order and shows the sort on the headers, the summary, and the panel. */
  const draw = () => {
    sorted = sortRows(o.rows, keys, levels, o.rowId);
    for (const old of table.querySelectorAll(':scope > tbody')) old.remove();
    for (const body of bodies()) table.insertBefore(body, o.foot ?? null);
    for (const [id, { th, mark, note }] of heads) {
      const at = levels.findIndex(l => l.column === id);
      const level = levels[at];
      const key = keys.find(k => k.id === id) as SortKey<Row>;
      th.classList.toggle('is-sorted', at >= 0);
      if (at === 0 && level) th.setAttribute('aria-sort', level.dir === 'asc' ? 'ascending' : 'descending');
      else th.removeAttribute('aria-sort');
      mark.replaceChildren(
        ...(level
          ? [icon(level.dir === 'asc' ? 'arrowUp' : 'arrowDown', { size: 14, stroke: 2.5 }), levels.length > 1 ? String(at + 1) : '']
          : [])
      ); // prettier-ignore
      note.textContent = level
        ? `${capital(ORDINALS[at] ?? '')} sort column, ${dirWords(key, level.dir)}.`
        : 'Not sorted. Press to sort by this column, with Shift to add it as the next sort column.';
    }
    summary.textContent = describeSort(levels, keys, defaultOrder);
    drawLevels();
    o.onSort?.(shownRows());
  };

  /** A new sort: remembered, drawn, announced, and focus kept on `focusId` when the panel redrew it. */
  const change = (next: SortLevel[], focusId?: string) => {
    levels = next;
    if (next.length) memory.set(o.key, next);
    else memory.delete(o.key);
    draw();
    status.textContent = describeSort(levels, keys, defaultOrder);
    if (focusId) document.getElementById(focusId)?.focus();
  };

  draw();
  const element = h(
    'div',
    { class: 'sortable' },
    h('div', { class: 'sort-bar' }, toggle, summary),
    panel,
    o.scroll ? scrollRegion(o.caption, table) : table,
    o.status ? null : status
  );
  return { element, table, rows: () => sorted };
}
