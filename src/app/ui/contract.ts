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
import { scrollRegion } from './stat-table';

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
            h('p', null, `Free agent. He asks for ${money(askingSalary(league, player), true)} a year.`),
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
  const head = (label: string, numeric = false) =>
    h('th', { scope: 'col', class: numeric ? 'num' : null }, label);
  const table = h(
    'table',
    { class: 'stat-table' },
    h('caption', { class: 'sr-only' }, 'Contract by league year: cap hit, cash, and what a release would do'),
    h('thead', null, h('tr', null, head('Year'), head('Cap hit', true), head('Base', true), head('Bonuses', true), head('Proration', true), head('Cash', true), head('Released before June 1'), head('Released after June 1'))),
    h('tbody', null, ...rows.map(r =>
      h('tr', null,
        h('th', { scope: 'row' }, r.isVoid ? `${r.year} (void)` : String(r.year)),
        h('td', { class: 'num' }, money(r.capHit)),
        h('td', { class: 'num' }, money(r.base)),
        h('td', { class: 'num' }, money(r.bonuses)),
        h('td', { class: 'num' }, money(r.proration)),
        h('td', { class: 'num' }, money(r.cash)),
        h('td', null, r.isVoid ? 'Not applicable' : releaseText(r.cutEarly)),
        h('td', null, r.isVoid ? 'Not applicable' : releaseText(r.cutLate))
      )
    ))
  ); // prettier-ignore
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
    rows.length ? scrollRegion('Contract by year', table) : h('p', { class: 'muted' }, 'The contract has ended.'),
    h('p', { class: 'hint' }, 'A release after June 1, or with a June 1 designation, leaves this year its own proration and moves the rest to next year.'),
    moves ? h('div', { class: 'btn-row' }, moves) : null
  ); // prettier-ignore
}
