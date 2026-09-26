/**
 * The contract card on the player page (spec 11.2, 19.3): the deal's size and guarantees, then each
 * remaining league year's cap hit and cash, and what releasing him would do before and after June 1:
 * dead money and the cap space it saves. The user's players get their roster moves from here too.
 */
import { askingSalary } from '../../engine/contracts/acceptance';
import type { ContractType } from '../../engine/contracts/types';
import { contractSummary, contractView, type ReleaseView } from '../../engine/contracts/view';
import { capFacts } from '../../engine/cap/sheet';
import type { League } from '../../engine/league/types';
import { leagueYear, PHASE_LABELS } from '../../engine/model/calendar';
import type { Player } from '../../engine/model/player';
import { plural } from '../../engine/text';
import { h } from '../dom';
import { money } from '../format';
import { href } from '../router';
import type { AppState } from '../state';
import { card } from '../screens/common';
import { openRosterMoves } from './moves';
import { sortableTable, type TableColumn } from './sortable';

const TYPE_LABELS: Record<ContractType, string> = {
  rookie: 'Rookie contract',
  veteran: 'Veteran contract',
  extension: 'Extension',
  franchiseTag: 'Franchise tag',
  transitionTag: 'Transition tag',
  rfaTender: 'Restricted free agent tender',
  minimum: 'Minimum contract',
  practiceSquad: 'Practice squad contract',
  udfa: 'Undrafted free agent contract'
};

/** Dead money and savings of a release, in words for a table cell. */
function releaseText(r: ReleaseView | null): string {
  if (!r) return 'Not applicable';
  const dead = r.deadNext ? `${money(r.deadNow)} + ${money(r.deadNext)} next year` : money(r.deadNow);
  return `${dead} dead; ${r.savings >= 0 ? 'saves' : 'costs'} ${money(Math.abs(r.savings))}`;
}

export function contractCard(app: AppState, league: League, player: Player, done: () => void): HTMLElement {
  const contract = player.contractId ? league.contracts[player.contractId] : undefined;
  const user = league.meta.start.userTeam;
  if (!contract) {
    const body =
      player.status === 'freeAgent'
        ? [
            h('p', null, `Free agent. He asks you for ${money(askingSalary(league, player, league.meta.start.userTeam), true)} a year.`),
            h('div', { class: 'btn-row' }, h('a', { class: 'btn btn-outline', href: href('freeagency') }, 'Free agency'))
          ]
        : player.status === 'waivers'
          ? [h('p', null, 'On waivers.'), h('div', { class: 'btn-row' }, h('a', { class: 'btn btn-outline', href: href('freeagency') }, 'Free agency'))]
          : [h('p', { class: 'muted' }, 'No contract.')];
    return card('Contract', ...body);
  } // prettier-ignore
  const s = contractSummary(contract, league.date);
  const rows = contractView(contract, league.date, league.rules, capFacts(league, player.id));
  const current = leagueYear(league.date);
  type Year = (typeof rows)[number];
  const cash = (id: string, label: string, amount: (r: Year) => number): TableColumn<Year> => ({
    id,
    label,
    name: label.toLowerCase(),
    type: 'money',
    numeric: true,
    value: amount,
    cell: r => h('td', { class: 'num' }, money(amount(r)))
  });
  const release = (id: string, label: string, of: (r: Year) => ReleaseView | null): TableColumn<Year> => ({
    id,
    label,
    name: `savings if ${label.toLowerCase()}`,
    type: 'money',
    value: r => (r.isVoid ? null : (of(r)?.savings ?? null)),
    cell: r => h('td', null, r.isVoid ? 'Not applicable' : releaseText(of(r)))
  });
  const columns: TableColumn<Year>[] = [
    {
      id: 'year',
      label: 'Year',
      name: 'year',
      type: 'number',
      first: 'asc',
      value: r => r.year,
      cell: r => h('th', { scope: 'row' }, r.isVoid ? `${r.year} (void)` : String(r.year))
    },
    cash('capHit', 'Cap hit', r => r.capHit),
    cash('base', 'Base', r => r.base),
    cash('bonuses', 'Bonuses', r => r.bonuses),
    cash('proration', 'Proration', r => r.proration),
    cash('cash', 'Cash', r => r.cash),
    release('early', 'Released before June 1', r => r.cutEarly),
    release('late', 'Released after June 1', r => r.cutLate)
  ];
  const table = sortableTable({
    key: 'contract.years',
    name: 'contract by year',
    caption: 'Contract by league year: cap hit, cash, and what a release would do',
    captionClass: 'sr-only',
    className: 'stat-table',
    columns,
    rows,
    rowId: r => String(r.year),
    defaultOrder: 'by year',
    scroll: true
  });
  const row = (label: string, value: string) =>
    h('div', { class: 'kv' }, h('span', { class: 'label' }, label), h('span', null, value));
  const moves =
    player.team === user ? h('button', { class: 'btn btn-solid', type: 'button' }, 'Roster moves') : null;
  moves?.addEventListener('click', () => openRosterMoves(app, player, moves, done));
  return card(
    'Contract',
    h('div', { class: 'stack' },
      row('Contract', TYPE_LABELS[contract.type]),
      row('Total', `${money(s.total)} over ${s.years} ${s.years === 1 ? 'year' : 'years'}`),
      row('AAV', money(s.apy)),
      row('Guaranteed at signing', money(s.guaranteed)),
      row('Years remaining', `${s.remaining} ${s.remaining === 1 ? 'year' : 'years'} from ${current}`),
      contract.weeklyPay ? row('Weekly pay', money(contract.weeklyPay, true)) : null,
      ...contract.restructures.map(r => row(`Restructured, ${PHASE_LABELS[r.date.phase]} ${r.date.season}`, `${money(r.amount)} of salary spread over ${plural(r.prorationYears.length, 'year')}`))
    ),
    rows.length ? table.element : h('p', { class: 'muted' }, 'The contract has ended.'),
    h('p', { class: 'hint' }, 'A release after June 1 leaves this year its own proration and moves the rest to next year. A June 1 designation does the same, but its savings arrive on June 2.'),
    moves ? h('div', { class: 'btn-row' }, moves) : null
  ); // prettier-ignore
}
