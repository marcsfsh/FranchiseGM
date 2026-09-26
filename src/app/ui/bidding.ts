/**
 * Free agency's bidding on the Free agency screen (spec 11.8; D-53): the offer dialog for the four weeks of
 * free agency, when offers stand until the week ends and the free agents decide. It says what he asks of
 * the user's team and whether the offer would win him as the offers stand.
 */
import { askingFrom, contextFor, offerValue } from '../../engine/contracts/decision';
import {
  makeOffer,
  offerProblem,
  offersFor,
  standing,
  withdrawOffer
} from '../../engine/contracts/free-agency';
import type { League } from '../../engine/league/types';
import { calendarDay } from '../../engine/model/calendar';
import { ageOn, fullName, type Player } from '../../engine/model/player';
import { minimumSalary } from '../../engine/rules/ruleset';
import { plural } from '../../engine/text';
import { TUNING } from '../../engine/tuning';
import { h } from '../dom';
import { actionDialogFrame, openDialog, toast } from '../feedback';
import { money } from '../format';
import type { AppState } from '../state';
import { dollarField } from './moves';

/** The user's standing offer to a free agent, in words: "$4,500,000 a year for 2 years". */
export function offerWords(league: League, playerId: string): string | null {
  const mine = offersFor(league, playerId).find(o => o.team === league.meta.start.userTeam);
  return mine
    ? `${money(offerValue(mine.offer), true)} a year for ${plural(mine.offer.years, 'year')}`
    : null;
}

/** The offer dialog while the bidding is open: years, salary, and bonus, and how he'd weigh the offer. */
export function openBid(app: AppState, league: League, player: Player, trigger: HTMLElement, done: () => void): void {
  const user = league.meta.start.userTeam;
  const name = fullName(player);
  const mine = offersFor(league, player.id).find(o => o.team === user);
  const others = offersFor(league, player.id).filter(o => o.team !== user).length;
  const minimum = minimumSalary(league.rules, player.experience);
  const ask = askingFrom(league, contextFor(league), player, user);
  const years = h('select', { class: 'select', id: 'bid-years' }, ...Array.from({ length: TUNING.contracts.acceptance.maxYears }, (_, i) => h('option', { value: i + 1, selected: (mine?.offer.years ?? 1) === i + 1 }, `${i + 1} ${i === 0 ? 'year' : 'years'}`)));
  const salary = dollarField('bid-salary', 'Salary each year, dollars', `His minimum is ${money(minimum, true)}.`, mine?.offer.salary ?? ask);
  const bonus = dollarField('bid-bonus', 'Signing bonus, dollars', 'Paid when he signs and spread over the contract on the cap, up to 5 years.', mine?.offer.signingBonus ?? 0);
  const outlook = h('p', { class: 'hint', role: 'status' });
  /** The offer as entered, with his answer as the offers stand; null while a detail is wrong. */
  const check = () => {
    const s = salary.input.valueAsNumber;
    const b = bonus.input.valueAsNumber;
    salary.setError(!Number.isFinite(s) ? 'Enter a salary in dollars.' : null);
    bonus.setError(!Number.isFinite(b) ? 'Enter a signing bonus in dollars, or 0.' : null);
    if (!Number.isFinite(s) || !Number.isFinite(b)) {
      outlook.textContent = '';
      return null;
    }
    const offer = { years: Number(years.value), salary: Math.round(s), signingBonus: Math.round(b) };
    const problem = offerProblem(league, user, player.id, offer);
    salary.setError(problem);
    if (problem) {
      outlook.textContent = '';
      return null;
    }
    outlook.textContent = standing(league, user, player, offer);
    return offer;
  };
  for (const el of [years, salary.input, bonus.input]) el.addEventListener('input', () => void check());
  const send = h('button', { class: 'btn btn-primary', type: 'button' }, mine ? 'Change offer' : 'Send offer');
  const back = mine ? h('button', { class: 'btn btn-outline', type: 'button' }, 'Take back offer') : null;
  const cancel = h('button', { class: 'btn btn-outline', type: 'button', 'data-close': true, 'data-autofocus': true }, 'Cancel');
  const dialog = actionDialogFrame(
    'bidDialog',
    `Offer ${name} a contract`,
    [
      h('p', null, `${player.position} · Age ${ageOn(player.birthDate, calendarDay(league.date))} · OVR ${player.ovr}`),
      h('p', null, `He asks you for ${money(ask, true)} a year. Offers stand until the week ends, when free agents decide, the best players first; one who waits asks for less the next week. ${others ? `${plural(others, 'other team')} ${others === 1 ? 'has' : 'have'} made him an offer.` : 'No other team has made him an offer yet.'}`),
      h('div', { class: 'field' }, h('label', { for: 'bid-years' }, 'Contract length'), years),
      salary.field,
      bonus.field,
      outlook
    ],
    [send, back, cancel].filter((b): b is HTMLButtonElement => b !== null)
  );
  send.addEventListener('click', () => {
    const offer = check();
    if (!offer) return salary.input.focus();
    let problem: string | null = null;
    app.edit(l => (problem = makeOffer(l, user, player.id, offer)), ['bid', player.id, offer]);
    if (problem) {
      salary.setError(problem);
      return salary.input.focus();
    }
    dialog.close();
    toast(`You offered ${name} ${money(offerValue(offer), true)} a year for ${plural(offer.years, 'year')}. He decides as the week ends.`);
    done();
  });
  back?.addEventListener('click', () => {
    app.edit(l => withdrawOffer(l, user, player.id), ['bidWithdraw', player.id]);
    dialog.close();
    toast(`You took back your offer to ${name}.`);
    done();
  });
  document.getElementById('bidDialog')?.remove();
  document.body.append(dialog);
  dialog.addEventListener('close', () => window.setTimeout(() => dialog.remove(), 0));
  void check();
  openDialog(dialog, trigger);
} // prettier-ignore
