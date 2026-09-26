/**
 * An offer's terms in the contract dialogs (spec 11.6; D-54, D-64): length, salary, signing bonus, and years
 * of fully guaranteed salary, with the incentives in a disclosure (a per-game roster bonus and a performance
 * incentive at a season mark) beside the void years that spread the bonus on the cap, and the
 * take-it-or-leave-it mark. The Free agency and Contracts screens use it for free agents' offers, standing
 * bids, and extensions.
 */
import type { TeamAbbr } from '../../data/team-colors';
import type { Offer } from '../../engine/contracts/build';
import {
  incentiveCondition,
  incentiveStats,
  seasonPace,
  STAT_WORDS
} from '../../engine/contracts/incentives';
import { floorEstimate } from '../../engine/contracts/negotiation';
import type { League } from '../../engine/league/types';
import type { Player } from '../../engine/model/player';
import type { StatKey } from '../../engine/sim/stats';
import { plural } from '../../engine/text';
import { TUNING } from '../../engine/tuning';
import { h } from '../dom';
import { money } from '../format';
import { dollarField, type DollarField } from './moves';

export interface OfferTermsOptions {
  /** The fields' ID prefix. */
  id: string;
  /** The length field's label: "Contract length" or "Extension length". */
  lengthLabel: string;
  /** His minimum salary a year, and the salary field's hint. */
  minimum: number;
  salaryHint: string;
  /** The most years a signing bonus spreads over (spec 11.2). */
  prorationMax: number;
  /** What a take-it-or-leave-it offer does here. */
  finalHint: string;
  /** The terms to start from. */
  start: Offer;
  /** What the front office expects on the terms as entered (spec 11.6), shown under them as they change. */
  advice?: (offer: Offer) => string;
  /** The stats his position's incentives can mark (none hides the performance incentive). */
  incentives?: readonly StatKey[];
  /** The mark a stat's incentive starts at when it's chosen: about his season's pace. */
  markFor?: (key: StatKey) => number;
}

export interface OfferTerms {
  element: HTMLElement;
  salary: DollarField;
  /** The offer as entered, or null while a detail is wrong (the field says what). */
  read(): Offer | null;
  /** Sets the terms, as from his counter. */
  set(offer: Offer): void;
}

const yearsWords = (n: number) => `${n} ${n === 1 ? 'year' : 'years'}`;

/**
 * The front office's read of an offer's terms (spec 11.6): the salaries a year it expects him to sign for on
 * them. The least he'd take is never shown.
 */
export const estimateAdvice =
  (league: League, team: TeamAbbr, player: Player, extension = false) =>
  (offer: Offer): string => {
    const { low, high } = floorEstimate(league, team, player, offer, extension);
    return `On these terms, your front office expects him to sign for ${money(low, true)} to ${money(high, true)} a year.`;
  };

/**
 * The performance incentives a player's offers can carry (spec 11.2): the stats his position piles up, each
 * starting at his season's pace, to the nearest ten for yards.
 */
export function incentiveOptions(
  league: League,
  player: Player
): Pick<OfferTermsOptions, 'incentives' | 'markFor'> {
  return {
    incentives: incentiveStats(player.position),
    markFor: key => {
      const pace = seasonPace(league, player, key) ?? 0;
      return key.endsWith('Yds') ? Math.round(pace / 10) * 10 : Math.round(pace);
    }
  };
}

/** A select with its label, hint, and error, like a dollar field. */
function selectField(id: string, label: string, hint: string) {
  const select = h('select', { class: 'select', id, 'aria-describedby': `${id}-hint ${id}-error` });
  const error = h('p', { class: 'field-error', id: `${id}-error`, hidden: true });
  const field = h('div', { class: 'field' }, h('label', { for: id }, label), select, h('p', { class: 'hint', id: `${id}-hint` }, hint), error);
  const setError = (message: string | null) => {
    error.textContent = message ?? '';
    error.hidden = message === null;
    if (message === null) select.removeAttribute('aria-invalid');
    else select.setAttribute('aria-invalid', 'true');
  };
  return { select, field, setError };
} // prettier-ignore

/** A whole-number field with its label, hint, and error. */
function countField(id: string, label: string, hint: string) {
  const input = h('input', { class: 'input', id, type: 'number', inputmode: 'numeric', min: 1, step: 1, 'aria-describedby': `${id}-hint ${id}-error` });
  const error = h('p', { class: 'field-error', id: `${id}-error`, hidden: true });
  const field = h('div', { class: 'field' }, h('label', { for: id }, label), input, h('p', { class: 'hint', id: `${id}-hint` }, hint), error);
  const setError = (message: string | null) => {
    error.textContent = message ?? '';
    error.hidden = message === null;
    if (message === null) input.removeAttribute('aria-invalid');
    else input.setAttribute('aria-invalid', 'true');
  };
  return { input, field, setError };
} // prettier-ignore

/** Fills a select with 0 to `max` years, keeping the choice where it still fits. */
function yearOptions(select: HTMLSelectElement, max: number, none: string, value: number): void {
  select.replaceChildren(...Array.from({ length: max + 1 }, (_, n) => h('option', { value: n }, n === 0 ? none : yearsWords(n))));
  select.value = String(Math.min(max, value));
} // prettier-ignore

export function offerTerms(options: OfferTermsOptions): OfferTerms {
  const { id, minimum, prorationMax, start } = options;
  const years = h(
    'select',
    { class: 'select', id: `${id}-years` },
    ...Array.from({ length: TUNING.contracts.acceptance.maxYears }, (_, i) =>
      h('option', { value: i + 1 }, yearsWords(i + 1))
    )
  );
  years.value = String(start.years);
  const salary = dollarField(`${id}-salary`, 'Salary each year, dollars', options.salaryHint, start.salary);
  salary.input.min = String(minimum);
  const bonus = dollarField(
    `${id}-bonus`,
    'Signing bonus, dollars',
    `Paid when he signs and spread over the contract on the cap, up to ${prorationMax} years. Some players value money up front more than the same money later.`,
    start.signingBonus
  );
  const guaranteed = selectField(
    `${id}-guaranteed`,
    'Fully guaranteed salary',
    "Years of salary, from the first, that he's paid even if you release him. Older and injury-prone players value guarantees most."
  );
  const perGame = dollarField(
    `${id}-per-game`,
    'Per-game roster bonus, dollars a season',
    "Earned a share at a time for each game he's active. He counts on it by how likely he is to dress; it counts on the cap as it's earned.",
    start.perGameBonus ?? 0
  );
  const stats = options.incentives ?? [];
  const incentive = selectField(
    `${id}-incentive`,
    'Performance incentive',
    "Paid each season he reaches the mark. He values it by how likely he thinks he is to reach it; it counts on the cap now if he's already reached the mark, and otherwise the year after he earns it."
  );
  incentive.select.replaceChildren(
    h('option', { value: '' }, 'None'),
    ...stats.map(k => h('option', { value: k }, STAT_WORDS[k] ?? k))
  );
  const mark = countField(`${id}-mark`, 'Mark for the season', 'The season total he must reach.');
  const reward = dollarField(`${id}-incentive-amount`, 'Incentive, dollars a season', 'Paid once a season he reaches the mark.', start.incentive?.amount ?? 0); // prettier-ignore
  const incentiveFields = h('div', { class: 'stack' }, mark.field, reward.field);
  const showIncentive = () => {
    incentiveFields.hidden = incentive.select.value === '';
  };
  incentive.select.addEventListener('change', () => {
    const key = incentive.select.value as StatKey | '';
    if (key && options.markFor) mark.input.value = String(Math.max(1, options.markFor(key)));
    showIncentive();
  });
  const voids = selectField(
    `${id}-voids`,
    'Void years',
    'Years added only to spread the signing bonus on the cap. The deal voids before they start, and the rest of the bonus comes onto the cap then.'
  );
  const final = h('input', {
    type: 'checkbox',
    id: `${id}-final`,
    checked: !!start.final,
    'aria-describedby': `${id}-final-hint`
  });
  const totals = h('p', { class: 'hint' });
  const advice = options.advice ? h('p', { class: 'hint' }) : null;
  const fitYears = (g: number, v: number) => {
    const n = Number(years.value);
    yearOptions(guaranteed.select, n, 'None', g);
    yearOptions(voids.select, Math.max(0, prorationMax - n), 'None', v);
  };
  const setIncentive = (offer: Offer) => {
    incentive.select.value =
      offer.incentive && stats.includes(offer.incentive.key) ? offer.incentive.key : '';
    mark.input.value = offer.incentive ? String(offer.incentive.atLeast) : '';
    reward.input.value = String(offer.incentive?.amount ?? 0);
    showIncentive();
  };
  fitYears(start.guaranteedYears ?? 0, start.voidYears ?? 0);
  setIncentive(start);
  years.addEventListener('change', () =>
    fitYears(Number(guaranteed.select.value), Number(voids.select.value))
  );
  const more = h(
    'details',
    { class: 'offer-more', open: !!(start.perGameBonus || start.incentive || start.voidYears) },
    h('summary', null, 'Incentives and void years'),
    h(
      'div',
      { class: 'stack' },
      perGame.field,
      ...(stats.length ? [incentive.field, incentiveFields] : []),
      voids.field
    )
  );
  const element = h(
    'div',
    { class: 'stack' },
    h('div', { class: 'field' }, h('label', { for: years.id }, options.lengthLabel), years),
    salary.field,
    bonus.field,
    guaranteed.field,
    more,
    h(
      'div',
      { class: 'field' },
      h('label', { class: 'check-target check-left', for: final.id }, final, 'Take it or leave it'),
      h('p', { class: 'hint', id: `${id}-final-hint` }, options.finalHint)
    ),
    totals,
    advice
  );
  const read = (): Offer | null => {
    const s = salary.input.valueAsNumber;
    const b = bonus.input.valueAsNumber;
    const pg = perGame.input.valueAsNumber;
    const v = Number(voids.select.value);
    const key = incentive.select.value as StatKey | '';
    const m = mark.input.valueAsNumber;
    const r = reward.input.valueAsNumber;
    salary.setError(!Number.isFinite(s) ? 'Enter a salary in dollars.' : s < minimum ? `His minimum salary is ${money(minimum, true)} a year.` : null);
    bonus.setError(!Number.isFinite(b) ? 'Enter a signing bonus in dollars, or 0.' : b < 0 ? "The signing bonus can't be negative." : null);
    perGame.setError(!Number.isFinite(pg) ? 'Enter a per-game roster bonus in dollars, or 0.' : pg < 0 ? "The per-game roster bonus can't be negative." : null);
    voids.setError(v > 0 && Number.isFinite(b) && Math.round(b) === 0 ? 'Void years only spread a signing bonus: add one, or choose none.' : null);
    const markError = key && (!Number.isInteger(m) || m < 1) ? 'Enter a whole-number mark of 1 or more.' : null;
    const rewardError = key && (!Number.isFinite(r) || r < 0) ? 'Enter the incentive in dollars, or 0.' : null;
    mark.setError(markError);
    reward.setError(rewardError);
    if (!Number.isFinite(s) || s < minimum || !Number.isFinite(b) || b < 0 || !Number.isFinite(pg) || pg < 0 || (v > 0 && Math.round(b) === 0) || markError || rewardError) {
      totals.textContent = '';
      if (advice) advice.textContent = '';
      return null;
    }
    const gy = Number(guaranteed.select.value);
    const pgv = Math.round(pg);
    const paid = key && Math.round(r) > 0 ? { key, atLeast: m, amount: Math.round(r) } : null;
    const offer: Offer = { years: Number(years.value), salary: Math.round(s), signingBonus: Math.round(b), guaranteedYears: gy, perGameBonus: pgv, ...(paid ? { incentive: paid } : {}), voidYears: v, final: final.checked };
    const n = offer.years;
    const total = (offer.salary + pgv) * n + offer.signingBonus;
    totals.textContent = `Total: ${money(total, true)} over ${plural(n, 'year')}. AAV: ${money(Math.round(total / n), true)}. Guaranteed: ${money(offer.signingBonus + offer.salary * gy, true)}.${paid ? ` Incentive: ${money(paid.amount, true)} a season at ${incentiveCondition(paid)}.` : ''}`;
    if (advice && options.advice) advice.textContent = options.advice(offer);
    return offer;
  }; // prettier-ignore
  const set = (offer: Offer) => {
    years.value = String(offer.years);
    salary.input.value = String(offer.salary);
    bonus.input.value = String(offer.signingBonus);
    perGame.input.value = String(offer.perGameBonus ?? 0);
    fitYears(offer.guaranteedYears ?? 0, offer.voidYears ?? 0);
    setIncentive(offer);
    final.checked = !!offer.final;
  };
  return { element, salary, read, set };
}
