/**
 * An offer's terms in the contract dialogs (spec 11.6; D-54): length, salary, and signing bonus, with more
 * terms in a disclosure (years of fully guaranteed salary, a per-game roster bonus, and void years that
 * spread the bonus on the cap), and the take-it-or-leave-it mark. The Free agency and Contracts screens use
 * it for free agents' offers, standing bids, and extensions.
 */
import type { Offer } from '../../engine/contracts/build';
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
    `Paid when he signs and spread over the contract on the cap, up to ${prorationMax} years.`,
    start.signingBonus
  );
  const guaranteed = selectField(
    `${id}-guaranteed`,
    'Fully guaranteed salary',
    "Years of salary, from the first, that he's paid even if you release him."
  );
  const perGame = dollarField(
    `${id}-per-game`,
    'Per-game roster bonus, dollars a season',
    "Earned a share at a time for each game he's active. He counts on most of it; it counts on the cap as it's earned.",
    start.perGameBonus ?? 0
  );
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
  const fitYears = (g: number, v: number) => {
    const n = Number(years.value);
    yearOptions(guaranteed.select, n, 'None', g);
    yearOptions(voids.select, Math.max(0, prorationMax - n), 'None', v);
  };
  fitYears(start.guaranteedYears ?? 0, start.voidYears ?? 0);
  years.addEventListener('change', () =>
    fitYears(Number(guaranteed.select.value), Number(voids.select.value))
  );
  const more = h(
    'details',
    { class: 'offer-more', open: !!(start.guaranteedYears || start.perGameBonus || start.voidYears) },
    h('summary', null, 'Guarantees, incentives, and void years'),
    h('div', { class: 'stack' }, guaranteed.field, perGame.field, voids.field)
  );
  const element = h(
    'div',
    { class: 'stack' },
    h('div', { class: 'field' }, h('label', { for: years.id }, options.lengthLabel), years),
    salary.field,
    bonus.field,
    more,
    h(
      'div',
      { class: 'field' },
      h('label', { class: 'check-target check-left', for: final.id }, final, 'Take it or leave it'),
      h('p', { class: 'hint', id: `${id}-final-hint` }, options.finalHint)
    ),
    totals
  );
  const read = (): Offer | null => {
    const s = salary.input.valueAsNumber;
    const b = bonus.input.valueAsNumber;
    const pg = perGame.input.valueAsNumber;
    const v = Number(voids.select.value);
    salary.setError(!Number.isFinite(s) ? 'Enter a salary in dollars.' : s < minimum ? `His minimum salary is ${money(minimum, true)} a year.` : null);
    bonus.setError(!Number.isFinite(b) ? 'Enter a signing bonus in dollars, or 0.' : b < 0 ? "The signing bonus can't be negative." : null);
    perGame.setError(!Number.isFinite(pg) ? 'Enter a per-game roster bonus in dollars, or 0.' : pg < 0 ? "The per-game roster bonus can't be negative." : null);
    voids.setError(v > 0 && Number.isFinite(b) && Math.round(b) === 0 ? 'Void years only spread a signing bonus: add one, or choose none.' : null);
    if (!Number.isFinite(s) || s < minimum || !Number.isFinite(b) || b < 0 || !Number.isFinite(pg) || pg < 0 || (v > 0 && Math.round(b) === 0)) {
      totals.textContent = '';
      return null;
    }
    const gy = Number(guaranteed.select.value);
    const pgv = Math.round(pg);
    const offer: Offer = { years: Number(years.value), salary: Math.round(s), signingBonus: Math.round(b), guaranteedYears: gy, perGameBonus: pgv, voidYears: v, final: final.checked };
    const n = offer.years;
    const total = (offer.salary + pgv) * n + offer.signingBonus;
    totals.textContent = `Total: ${money(total, true)} over ${plural(n, 'year')}. AAV: ${money(Math.round(total / n), true)}. Guaranteed: ${money(offer.signingBonus + offer.salary * gy, true)}.`;
    return offer;
  }; // prettier-ignore
  const set = (offer: Offer) => {
    years.value = String(offer.years);
    salary.input.value = String(offer.salary);
    bonus.input.value = String(offer.signingBonus);
    perGame.input.value = String(offer.perGameBonus ?? 0);
    fitYears(offer.guaranteedYears ?? 0, offer.voidYears ?? 0);
    final.checked = !!offer.final;
  };
  return { element, salary, read, set };
}
