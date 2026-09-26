/**
 * The UDFA scramble on the Free agency screen (spec 10.4; D-49): the rookies nobody drafted, each with the
 * user's chance to keep him on the roster, the teams offering, and the user's offer, and an offer dialog
 * that says whose offer he'd take as things stand. Offers come out of the user's bonus pool; the rookies
 * choose as the undrafted free agents step ends.
 */
import { TEAM_COLORS } from '../../data/team-colors';
import {
  offerProblem,
  offersFor,
  opportunity,
  pledged,
  undraftedRookies,
  withdrawOffer,
  makeOffer
} from '../../engine/draft/udfa';
import type { League } from '../../engine/league/types';
import { calendarDay } from '../../engine/model/calendar';
import { ageOn, fullName, type Player } from '../../engine/model/player';
import { POSITION_GROUP, POSITIONS, type PositionGroup } from '../../engine/model/positions';
import { plural } from '../../engine/text';
import { TUNING } from '../../engine/tuning';
import { h } from '../dom';
import { actionDialogFrame, openDialog, toast } from '../feedback';
import { money } from '../format';
import type { AppState } from '../state';
import { dollarField } from './moves';
import { GROUP_LABELS, playerLink, tierPlate } from './players';
import { sortableTable, type TableColumn } from './sortable';

const U = TUNING.draft.udfa;
const PAGE = 40;
/** The card's filter and page length, kept while the user moves around the app. */
const kept = { group: 'all' as PositionGroup | 'all', shown: PAGE };

/** A rookie's chance to make the user's roster, in a word. */
const chanceWord = (chance: number): string =>
  chance >= 0.6 ? 'Good' : chance >= 0.3 ? 'Fair' : chance > 0 ? 'Slim' : 'Long shot';

/** The offer dialog: a signing bonus, what's left in the pool, and whose offer he'd take as things stand. */
function openOffer(
  app: AppState,
  league: League,
  player: Player,
  trigger: HTMLElement,
  done: () => void
): void {
  const user = league.meta.start.userTeam;
  const name = fullName(player);
  const mine = league.udfaOffers[player.id]?.find(o => o.team === user);
  const left = U.pool - pledged(league, user) + (mine?.bonus ?? 0);
  const others = (league.udfaOffers[player.id] ?? []).filter(o => o.team !== user).length;
  const bonus = dollarField('udfa-bonus', 'Signing bonus, dollars', `From $0 to ${money(U.maxBonus, true)}, in steps of ${money(U.step, true)}. Your pool has ${money(left, true)} left for him.`, mine?.bonus ?? Math.min(U.step * 2, left), U.step); // prettier-ignore
  const outlook = h('p', { class: 'hint', role: 'status' });
  const chance = chanceWord(opportunity(league, user, player)).toLowerCase();
  /** Whose offer he'd take with this bonus, as the offers stand now; null while the bonus is wrong. */
  const check = (): number | null => {
    const value = bonus.input.valueAsNumber;
    const problem = Number.isFinite(value) ? offerProblem(league, user, player.id, value) : 'Enter a signing bonus in dollars, or 0.';
    bonus.setError(problem);
    if (problem) {
      outlook.textContent = '';
      return null;
    }
    const trial = structuredClone(league.udfaOffers[player.id] ?? []).filter(o => o.team !== user);
    const best = offersFor({ ...league, udfaOffers: { [player.id]: [...trial, { team: user, bonus: value }] } }, player)[0];
    outlook.textContent = best?.team === user ? 'As the offers stand now, he would take yours.' : `As the offers stand now, he would take the ${TEAM_COLORS[best?.team ?? user].name}' offer.`;
    return value;
  }; // prettier-ignore
  bonus.input.addEventListener('input', () => void check());
  const send = h(
    'button',
    { class: 'btn btn-primary', type: 'button' },
    mine ? 'Change offer' : 'Send offer'
  );
  const back = mine ? h('button', { class: 'btn btn-outline', type: 'button' }, 'Take back offer') : null;
  const cancel = h('button', { class: 'btn btn-outline', type: 'button', 'data-close': true, 'data-autofocus': true }, 'Cancel'); // prettier-ignore
  const dialog = actionDialogFrame(
    'udfaDialog',
    `Offer ${name} a signing bonus`,
    [
      h('p', null, `${player.position} · ${player.college} · Age ${ageOn(player.birthDate, calendarDay(league.date))} · OVR ${player.ovr}`),
      h('p', null, `The undrafted deal: three years at the minimum, with the bonus you offer. His chance to make your roster: ${chance}. ${others ? `${plural(others, 'other team')} ${others === 1 ? 'has' : 'have'} made him an offer.` : 'No other team has made him an offer yet.'}`),
      bonus.field,
      outlook
    ],
    [send, back, cancel].filter((b): b is HTMLButtonElement => b !== null)
  ); // prettier-ignore
  send.addEventListener('click', () => {
    const value = check();
    if (value === null) return bonus.input.focus();
    let problem: string | null = null;
    app.edit(
      l => {
        problem = makeOffer(l, user, player.id, value);
      },
      ['udfaOffer', player.id, value]
    );
    if (problem) {
      bonus.setError(problem);
      return bonus.input.focus();
    }
    dialog.close();
    toast(`You offered ${name} a ${money(value, true)} signing bonus.`);
    done();
  });
  back?.addEventListener('click', () => {
    app.edit(l => withdrawOffer(l, user, player.id), ['udfaWithdraw', player.id]);
    dialog.close();
    toast(`You took back your offer to ${name}.`);
    done();
  });
  document.getElementById('udfaDialog')?.remove();
  document.body.append(dialog);
  dialog.addEventListener('close', () => window.setTimeout(() => dialog.remove(), 0));
  void check();
  openDialog(dialog, trigger);
}

/**
 * The undrafted rookies card. `rebuild` redraws the screen after an offer, focusing the control `key`
 * names; `status` announces the filter's count.
 */
export function udfaCard(
  app: AppState,
  league: League,
  status: HTMLElement,
  rebuild: (key: string | null) => void
): HTMLElement {
  const user = league.meta.start.userTeam;
  const today = calendarDay(league.date);
  const all = undraftedRookies(league).sort((a, b) => b.ovr - a.ovr || b.potential - a.potential || (a.id < b.id ? -1 : 1)); // prettier-ignore
  const shown = kept.group === 'all' ? all : all.filter(p => POSITION_GROUP[p.position] === kept.group);
  const chance = new Map(shown.map(p => [p.id, opportunity(league, user, p)]));
  const offers = (p: Player) => league.udfaOffers[p.id] ?? [];
  const mine = (p: Player) => offers(p).find(o => o.team === user)?.bonus ?? null;
  const offersText = (p: Player) => {
    const n = offers(p).filter(o => o.team !== user).length;
    return n ? plural(n, 'team') : 'None';
  };
  // Each call makes a fresh button: the table and the phone list both show one.
  const action = (p: Player): HTMLElement => {
    const name = fullName(p);
    const label = mine(p) === null ? `Offer ${name} a bonus` : `Change your offer to ${name}`;
    const button = h('button', { class: 'btn btn-solid', type: 'button', 'aria-label': label, 'aria-haspopup': 'dialog', 'data-focus': `udfa-${p.id}` }, mine(p) === null ? 'Offer' : 'Change offer'); // prettier-ignore
    // A double-click's second click lands on the redrawn button: it's ignored.
    button.addEventListener('click', event => {
      if (event.detail <= 1) openOffer(app, league, p, button, () => rebuild(`[data-focus="udfa-${CSS.escape(p.id)}"]`));
    }); // prettier-ignore
    return button;
  };
  const columns: TableColumn<Player>[] = [
    { id: 'position', label: 'Pos', title: 'Position', name: 'position', type: 'number', first: 'asc', words: ['quarterbacks first', 'specialists first'], className: 'pos-col', value: p => POSITIONS.indexOf(p.position), cell: p => h('td', null, p.position) },
    { id: 'player', label: 'Player', name: 'player', type: 'text', value: p => `${p.lastName} ${p.firstName}`, cell: p => h('th', { scope: 'row' }, playerLink(p)) },
    { id: 'age', label: 'Age', name: 'age', type: 'number', numeric: true, className: 'age-col', value: p => ageOn(p.birthDate, today), cell: p => h('td', { class: 'num' }, ageOn(p.birthDate, today)) },
    { id: 'ovr', label: 'OVR', title: 'Overall', name: 'overall', type: 'rating', className: 'ovr-col', value: p => p.ovr, cell: p => h('td', null, tierPlate(p.ovr)) },
    { id: 'chance', label: 'Chance', title: 'His chance to make your roster', name: 'chance to make your roster', type: 'number', words: ['lowest first', 'highest first'], className: 'wide chance-col', value: p => chance.get(p.id), cell: p => h('td', { class: 'wide' }, chanceWord(chance.get(p.id) ?? 0)) },
    { id: 'offers', label: 'Offers', title: 'Other teams offering', name: 'other teams offering', type: 'number', numeric: true, className: 'wide offers-col', value: p => offers(p).filter(o => o.team !== user).length, cell: p => h('td', { class: 'wide' }, offersText(p)) },
    { id: 'mine', label: 'Your offer', name: 'your offer', type: 'money', numeric: true, className: 'cap-col', value: p => mine(p), cell: p => h('td', { class: 'num' }, mine(p) === null ? '—' : money(mine(p) as number, true)) },
    { id: 'action', label: 'Offer', name: 'offer', type: 'custom', sortable: false, hideLabel: true, className: 'udfa-action-col', cell: p => h('td', null, action(p)) }
  ]; // prettier-ignore
  const list = h('ul', { class: 'roster-list', 'aria-label': 'Undrafted rookies' });
  const items = new Map<string, HTMLElement>();
  const item = (p: Player): HTMLElement => {
    let li = items.get(p.id);
    if (!li) {
      const bonus = mine(p);
      li = h('li', { class: 'list-row' }, h('span', { class: 'pos' }, p.position), h('div', { class: 'list-main' }, playerLink(p), h('p', { class: 'list-sub' }, `Age ${ageOn(p.birthDate, today)} · Chance with you: ${chanceWord(chance.get(p.id) ?? 0).toLowerCase()} · Other offers: ${offersText(p).toLowerCase()}${bonus === null ? '' : ` · Your offer: ${money(bonus, true)}`}`)), tierPlate(p.ovr), h('div', { class: 'btn-row' }, action(p))); // prettier-ignore
      items.set(p.id, li);
    }
    return li;
  };
  const table = shown.length
    ? sortableTable({ key: 'fa.udfa', name: 'undrafted rookies', caption: 'Undrafted rookies', captionClass: 'sr-only', className: 'roster-table fa-table udfa-table', columns, rows: shown, rowId: p => p.id, defaultOrder: 'by overall, best first', status, limit: kept.shown, onSort: ordered => list.replaceChildren(...ordered.map(item)) }) // prettier-ignore
    : null;
  const group = h('select', { class: 'select', id: 'udfa-group' }, h('option', { value: 'all' }, 'All positions'), ...(Object.keys(GROUP_LABELS) as PositionGroup[]).map(g => h('option', { value: g }, GROUP_LABELS[g]))); // prettier-ignore
  group.value = kept.group;
  group.addEventListener('change', () => {
    kept.group = group.value as PositionGroup | 'all';
    kept.shown = PAGE;
    rebuild('#udfa-group');
    status.textContent = document.querySelector('main .udfa-count')?.textContent ?? '';
  });
  const moreCount = Math.min(PAGE, shown.length - kept.shown);
  const more = moreCount > 0 ? h('button', { class: 'btn btn-outline', type: 'button', 'data-focus': 'udfa-more' }, `Show ${moreCount} more`) : null; // prettier-ignore
  more?.addEventListener('click', () => {
    const page = kept.shown;
    kept.shown += PAGE;
    rebuild(null);
    [...document.querySelectorAll<HTMLElement>('main .udfa-table tbody a, main .udfa-card .roster-list a')].filter(a => a.getClientRects().length > 0).at(page)?.focus(); // prettier-ignore
  });
  const offered = Object.values(league.udfaOffers).filter(o => o.some(x => x.team === user)).length;
  const where = kept.group === 'all' ? '' : ` among the ${GROUP_LABELS[kept.group].toLowerCase()}`;
  return h(
    'section',
    { class: 'card udfa-card' },
    h('div', { class: 'signbar' }, h('h2', { class: 'signbar-title' }, 'Undrafted rookies')),
    h('div', { class: 'card-body stack' },
      h('p', null, `The rookies nobody drafted choose among teams' offers as the undrafted free agents step ends. Each offer is three years at the minimum with a signing bonus from your pool of ${money(U.pool, true)}. They weigh their chance to make your roster more than the money.`),
      h('p', { class: 'hint' }, `Your pool has ${money(U.pool - pledged(league, user), true)} left. You've made ${plural(offered, 'offer')}.`),
      h('div', { class: 'filterbar' }, h('div', { class: 'field' }, h('label', { for: 'udfa-group' }, 'Position'), group)),
      h('p', { class: 'udfa-count' }, `${plural(shown.length, 'rookie')}${where}.`),
      table ? h('div', { class: 'roster-region' }, table.element, list) : h('p', { class: 'empty' }, kept.group === 'all' ? 'Every undrafted rookie has signed.' : 'No undrafted rookies at this position. Choose another position to see the rest.'),
      more)
  ); // prettier-ignore
}
