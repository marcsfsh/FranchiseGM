/**
 * Free agency's bidding on the Free agency screen (spec 11.8; D-53): the offer dialog for the four weeks of
 * free agency, when offers stand until the week ends and the free agents decide. It takes every term of an
 * offer (spec 11.6), and says what he asks of the user's team and whether the offer would win him as the
 * offers stand.
 */
import { offerAav } from '../../engine/contracts/build';
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
import { askOf } from '../../engine/contracts/negotiation';
import { minimumSalary } from '../../engine/rules/ruleset';
import { plural } from '../../engine/text';
import { h } from '../dom';
import { actionDialogFrame, openDialog, toast } from '../feedback';
import { money } from '../format';
import type { AppState } from '../state';
import { incentiveOptions, offerTerms } from './offer-terms';

/** The user's standing offer to a free agent, in words: "$4,500,000 a year for 2 years". */
export function offerWords(league: League, playerId: string): string | null {
  const mine = offersFor(league, playerId).find(o => o.team === league.meta.start.userTeam);
  return mine ? `${money(offerAav(mine.offer), true)} a year for ${plural(mine.offer.years, 'year')}` : null;
}

/** The offer dialog while the bidding is open: every term of the offer, and how he'd weigh it. */
export function openBid(app: AppState, league: League, player: Player, trigger: HTMLElement, done: () => void): void {
  const user = league.meta.start.userTeam;
  const name = fullName(player);
  const mine = offersFor(league, player.id).find(o => o.team === user);
  const minimum = minimumSalary(league.rules, player.experience);
  const ask = askOf(league, player, user);
  const terms = offerTerms({
    id: 'bid',
    lengthLabel: 'Contract length',
    minimum,
    salaryHint: `His minimum is ${money(minimum, true)}.`,
    prorationMax: league.rules.pay.prorationYearsMax,
    finalHint: "If he doesn't take it as the week ends, it falls away instead of standing.",
    start: mine?.offer ?? { years: 1, salary: ask, signingBonus: 0 },
    ...incentiveOptions(league, player)
  });
  const outlook = h('p', { class: 'hint', role: 'status' });
  /** The offer as entered, with his answer as the offers stand; null while a detail is wrong. */
  const check = () => {
    const offer = terms.read();
    if (!offer) {
      outlook.textContent = '';
      return null;
    }
    const problem = offerProblem(league, user, player.id, offer);
    terms.salary.setError(problem);
    if (problem) {
      outlook.textContent = '';
      return null;
    }
    outlook.textContent = standing(league, user, player, offer);
    return offer;
  };
  terms.element.addEventListener('input', () => void check());
  terms.element.addEventListener('change', () => void check());
  const send = h('button', { class: 'btn btn-primary', type: 'button' }, mine ? 'Change offer' : 'Send offer');
  const back = mine ? h('button', { class: 'btn btn-outline', type: 'button' }, 'Take back offer') : null;
  const cancel = h('button', { class: 'btn btn-outline', type: 'button', 'data-close': true, 'data-autofocus': true }, 'Cancel');
  const dialog = actionDialogFrame(
    'bidDialog',
    `Offer ${name} a contract`,
    [
      h('p', null, `${player.position} · Age ${ageOn(player.birthDate, calendarDay(league.date))} · OVR ${player.ovr}`),
      h('p', null, `His agent asks you for ${money(ask, true)} a year, more than the least he'd take. Offers stand until the week ends, when free agents decide, the best players first; one who waits may ask for less the next week, or sign elsewhere.`),
      terms.element,
      outlook
    ],
    [send, back, cancel].filter((b): b is HTMLButtonElement => b !== null)
  );
  send.addEventListener('click', () => {
    const offer = check();
    if (!offer) return terms.salary.input.focus();
    let problem: string | null = null;
    app.edit(l => (problem = makeOffer(l, user, player.id, offer)), ['bid', player.id, offer]);
    if (problem) {
      terms.salary.setError(problem);
      return terms.salary.input.focus();
    }
    dialog.close();
    toast(`You offered ${name} ${money(offerAav(offer), true)} a year for ${plural(offer.years, 'year')}. ${offer.final ? 'He takes it or leaves it as the week ends.' : 'He decides as the week ends.'}`);
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
