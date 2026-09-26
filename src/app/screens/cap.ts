/**
 * The salary cap, in the Finances section (spec 11.1, 11.2, 19.3): the team's cap sheet by league year,
 * each player's cap hit and its parts, dead money from deals that ended, and the space left, with the rule
 * of 51 from the league year's opening to the regular season. Revenue and expenses join it with M16.
 */
import { teamFullName } from '../../data/team-colors';
import { capSheet, type CapSheet, type CapSheetLine } from '../../engine/cap/sheet';
import type { League } from '../../engine/league/types';
import { leagueYear } from '../../engine/model/calendar';
import { h, mount } from '../dom';
import { money } from '../format';
import { href } from '../router';
import { playerLink, statusTag } from '../ui/players';
import { sortableTable, type TableColumn } from '../ui/sortable';
import { tabs } from '../ui/tabs';
import { card, pageHead } from './common';
import type { Screen } from './types';

/** League years ahead of the current one the sheet shows. */
const YEARS_AHEAD = 3;
/** The selected year, kept while the user moves around the app. */
let selected: number | null = null;

function summaryCard(sheet: CapSheet): HTMLElement {
  // Money for players on the roster (with their practice squad pay before a promotion and elevations),
  // and money for players no longer here.
  const here = sheet.roster + sheet.earlier + sheet.elevations;
  const gone = sheet.dead + sheet.departed;
  const bar = h('div', { class: 'capbar', role: 'img', 'aria-label': `${money(here)} for players on the roster, ${money(gone)} for players no longer here, and ${money(Math.max(0, sheet.space))} of space` });
  const room = Math.max(1, sheet.cap + sheet.carryover);
  const part = (cls: string, amount: number) => {
    const i = h('i', { class: cls });
    i.style.width = `${Math.max(0, Math.min(100, (amount / room) * 100))}%`;
    return i;
  };
  bar.append(part('active', here), part('dead', gone));
  const row = (label: string, value: string) => h('div', { class: 'kv' }, h('span', { class: 'label' }, label), h('span', null, value));
  const optional = (label: string, amount: number) => (amount ? row(label, money(amount)) : null);
  return card(
    `${sheet.year} cap`,
    h('span', { class: 'label' }, 'Cap space'),
    h('p', { class: `big-number${sheet.space < 0 ? ' delta-bad' : ''}` }, money(sheet.space)),
    bar,
    h('div', { class: 'stack' },
      row('Salary cap', money(sheet.cap)),
      optional('Carried over from last year', sheet.carryover),
      row(sheet.offseason ? 'Roster, the 51 largest cap hits' : 'Roster', money(sheet.roster)),
      optional('Practice squad pay before promotions', sheet.earlier),
      optional('Elevated practice squad players', sheet.elevations),
      optional('Earned by players no longer here', sheet.departed),
      row('Dead money', money(sheet.dead)),
      row('Used', money(sheet.used))
    ),
    sheet.offseason
      ? h('p', { class: 'hint' }, 'From the league year opening until the final cutdown, only the 51 largest cap hits on the roster count; from the cutdown on, every contract counts.')
      : null
  );
} // prettier-ignore

/** A money column of a cap table. */
const moneyColumn = (id: string, label: string, amount: (line: CapSheetLine) => number): TableColumn<CapSheetLine> =>
  ({ id, label, name: label.toLowerCase(), type: 'money', numeric: true, value: amount, cell: line => h('td', { class: 'num' }, money(amount(line))) }); // prettier-ignore

function rosterTable(league: League, sheet: CapSheet, lines: readonly CapSheetLine[]): HTMLElement {
  const player = (line: CapSheetLine) => league.players[line.playerId];
  const columns: TableColumn<CapSheetLine>[] = [
    { id: 'player', label: 'Player', name: 'player', type: 'text', value: line => { const p = player(line); return p ? `${p.lastName} ${p.firstName}` : line.playerId; }, cell: line => { const p = player(line); return h('th', { scope: 'row' }, p ? playerLink(p) : line.playerId, line.counts ? null : h('span', { class: 'hint' }, ' (outside the top 51)')); } },
    { id: 'position', label: 'Pos', title: 'Position', name: 'position', type: 'text', value: line => player(line)?.position, cell: line => h('td', null, player(line)?.position ?? '') },
    { id: 'status', label: 'Status', name: 'status', type: 'text', value: line => line.status, cell: line => h('td', null, line.status ? statusTag(line.status) : '') },
    moneyColumn('base', 'Base', line => line.charge.base),
    moneyColumn('bonuses', 'Bonuses', line => line.charge.bonuses),
    moneyColumn('proration', 'Proration', line => line.charge.proration),
    moneyColumn('total', 'Cap hit', line => line.charge.total)
  ];
  return sortableTable({ key: 'cap.roster', name: `${sheet.year} cap hits`, caption: `${sheet.year} cap hits for players on the roster`, captionClass: 'sr-only', className: 'stat-table', columns, rows: lines, rowId: line => line.playerId, defaultOrder: 'by cap hit, largest first', scroll: true }).element;
} // prettier-ignore

function deadTable(league: League, sheet: CapSheet, lines: readonly CapSheetLine[]): HTMLElement {
  const player = (line: CapSheetLine) => league.players[line.playerId];
  const columns: TableColumn<CapSheetLine>[] = [
    { id: 'player', label: 'Player', name: 'player', type: 'text', value: line => { const p = player(line); return p ? `${p.lastName} ${p.firstName}` : line.playerId; }, cell: line => { const p = player(line); return h('th', { scope: 'row' }, p ? playerLink(p) : line.playerId, line.held ? h('span', { class: 'hint' }, ' (June 1 release, in full until June 2)') : null); } },
    moneyColumn('earned', 'Salary earned', line => line.charge.base + line.charge.bonuses),
    moneyColumn('proration', 'Proration', line => line.charge.proration),
    moneyColumn('dead', 'Accelerated or owed', line => line.charge.dead),
    moneyColumn('total', 'Charge', line => line.charge.total)
  ];
  return sortableTable({ key: 'cap.dead', name: `${sheet.year} dead money`, caption: `${sheet.year} charges for players no longer on the roster`, captionClass: 'sr-only', className: 'stat-table', columns, rows: lines, rowId: line => `${line.playerId}-${line.contractId ?? ''}`, defaultOrder: 'by charge, largest first', scroll: true }).element;
} // prettier-ignore

export function capScreen(): Screen {
  let off: (() => void) | null = null;
  return {
    title: 'Salary cap',
    dispose: () => off?.(),
    render: ({ app }) => {
      const view = h('section', { class: 'view' });
      if (!app.league) return view;
      let shown: League | null = null;
      off = app.onChange(() => {
        if (!app.league || app.league === shown) return;
        // A week played in the background: rebuild, keeping focus on the same control (a year tab).
        const id =
          document.activeElement instanceof HTMLElement && view.contains(document.activeElement)
            ? document.activeElement.id
            : '';
        build();
        if (id) document.getElementById(id)?.focus();
      });
      const build = (): void => {
        const league = app.league;
        if (!league) return;
        shown = league;
        const abbr = league.meta.start.userTeam;
        const current = leagueYear(league.date);
        const years = Array.from({ length: YEARS_AHEAD + 1 }, (_, i) => current + i);
        if (selected === null || !years.includes(selected)) selected = current;
        const panel = (year: number) => () => {
          const sheet = capSheet(league, abbr, year);
          const roster = sheet.lines.filter(l => l.status);
          // Deals that ended; a practice squad deal replaced on promotion is in the summary instead.
          const dead = sheet.lines.filter(l => !l.status && !l.replaced);
          return h(
            'div',
            { class: 'stack' },
            summaryCard(sheet),
            card(
              'Roster',
              year > current ? h('p', { class: 'hint' }, `Players under contract in ${year}. Players whose deals end before then aren't listed.`) : null,
              roster.length ? rosterTable(league, sheet, roster) : h('p', { class: 'empty' }, `No one is under contract for ${year} yet.`)
            ),
            card(
              'Dead money',
              h('p', { class: 'hint' }, 'What deals that ended still charge this year: salary earned before the move, proration, and money accelerated or still owed. A release with a June 1 designation counts in full until June 2.'),
              dead.length ? deadTable(league, sheet, dead) : h('p', { class: 'empty' }, `No dead money in ${year}.`)
            )
          );
        }; // prettier-ignore
        const yearTabs = tabs(
          'League years',
          years.map(y => ({ id: `cap-${y}`, label: String(y), render: panel(y) })),
          `cap-${selected}`,
          id => (selected = Number(id.replace('cap-', '')))
        );
        mount(
          view,
          pageHead('Salary cap', teamFullName(abbr)),
          h('p', null, 'Every contract counts against the cap by its structure: salary for the weeks it runs, bonuses when earned, and signing bonuses spread over up to five years. Release, restructure, or move players from the roster.'),
          h('div', { class: 'btn-row' }, h('a', { class: 'btn btn-outline', href: href('roster') }, 'Roster'), h('a', { class: 'btn btn-outline', href: href('freeagency') }, 'Free agency'), h('a', { class: 'btn btn-outline', href: href('contracts') }, 'Contracts')),
          yearTabs.element
        ); // prettier-ignore
      };
      build();
      return view;
    }
  };
}
