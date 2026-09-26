/**
 * Contract builders for generated players (spec 11.3, 11.4). Structures are realistic enough for cap
 * accounting: prorated signing bonuses, rising base salaries, guarantees, and rookie scale deals.
 */
import type { TeamAbbr } from '../../data/team-colors';
import type { Rng } from '../rng';
import { leagueYear, PHASES, type GameDate, type Phase } from '../model/calendar';
import { minimumSalary, type RuleSet } from '../rules/ruleset';
import { dollars, plural } from '../text';
import { TUNING } from '../tuning';
import { rookieSigningBonus } from './market';
import { emptyYear, type Contract, type ContractType, type ContractYear } from './types';

const roundK = (value: number) => Math.round(value / 1000) * 1000;

interface Base {
  id: string;
  playerId: string;
  team: TeamAbbr;
}

/** A phase's first week in a league year: phases from free agency on fall in the season before. */
const inLeagueYear = (year: number, phase: Phase): GameDate => ({
  season: PHASES.indexOf(phase) >= PHASES.indexOf('freeAgency') ? year - 1 : year,
  phase,
  week: 1
});

const signedAt = (year: number): GameDate => inLeagueYear(year, 'freeAgency');

function contract(base: Base, type: ContractType, signed: GameDate, signingBonus: number): Contract {
  return {
    ...base,
    signed,
    type,
    years: [],
    signingBonus,
    signingBonusYears: null,
    vesting: [],
    noTrade: false,
    fifthYearOption: 'none',
    restructures: [],
    weeklyPay: 0,
    ended: null
  };
}

/**
 * A four-year rookie scale deal (spec 11.4). `credited` is the player's credited seasons at signing.
 * First-round picks carry a fifth-year option and fully guaranteed base salaries.
 */
export function rookieContract(rules: RuleSet, base: Base, draftYear: number, pick: number): Contract {
  const bonus = rookieSigningBonus(rules, pick);
  const firstRound = pick <= 32;
  const c = contract(base, 'rookie', inLeagueYear(draftYear, 'draft'), bonus);
  c.fifthYearOption = firstRound ? 'eligible' : 'none';
  c.years = Array.from({ length: rules.rookieScale.years }, (_, i) => {
    const year = emptyYear(draftYear + i);
    year.base =
      minimumSalary(rules, i) + (firstRound ? roundK(bonus * rules.rookieScale.firstRoundBaseShare) : 0);
    year.guaranteedBase =
      firstRound || (i === 0 && pick <= TUNING.contracts.guaranteedFirstYearThroughPick) ? year.base : 0;
    return year;
  });
  return c;
}

/** An undrafted free agent deal: three minimum-salary years and a small bonus. */
export function udfaContract(rules: RuleSet, base: Base, signedYear: number, bonus: number): Contract {
  const c = contract(base, 'udfa', inLeagueYear(signedYear, 'udfa'), roundK(bonus));
  c.years = Array.from({ length: rules.rookieScale.udfaYears }, (_, i) => ({
    ...emptyYear(signedYear + i),
    base: minimumSalary(rules, i)
  }));
  return c;
}

export interface VeteranTerms {
  /** Average annual value in dollars. */
  apy: number;
  /** Total length in years. */
  length: number;
  /** Years already played before `season`. */
  elapsed: number;
  /** Credited seasons at signing, for minimum salaries. */
  creditedAtSigning: number;
  /** Share of the total paid as a signing bonus. */
  bonusShare: number;
}

/** Picks the tier for an average annual value from a list ordered from the highest minimum down. */
export function tierFor<T extends { minApy: number }>(tiers: readonly T[], apy: number): T {
  return tiers.find(t => apy >= t.minApy) ?? (tiers[tiers.length - 1] as T);
}

/** A typical signing bonus share for a deal of this size. */
export function typicalBonusShare(rng: Rng, apy: number): number {
  const [low, high] = tierFor(TUNING.contracts.bonusShare, apy).range;
  return rng.range(low, high);
}

/**
 * A veteran deal: a prorated signing bonus, base salaries that rise each year, and fully guaranteed
 * base salary in the first years of bigger deals.
 */
export function veteranContract(rules: RuleSet, base: Base, season: number, terms: VeteranTerms): Contract {
  const start = season - terms.elapsed;
  const total = terms.apy * terms.length;
  const signingBonus = roundK(total * terms.bonusShare);
  const weights = Array.from({ length: terms.length }, (_, i) => 1 + TUNING.contracts.baseRaisePerYear * i);
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const guaranteedYears = tierFor(TUNING.contracts.guaranteedYears, terms.apy).years;
  const c = contract(
    base,
    terms.apy <= minimumSalary(rules, terms.creditedAtSigning) * TUNING.contracts.minimumBand
      ? 'minimum'
      : 'veteran',
    signedAt(start),
    signingBonus
  );
  c.years = weights.map((w, i) => {
    const year = emptyYear(start + i);
    year.base = Math.max(
      minimumSalary(rules, terms.creditedAtSigning + i),
      roundK(((total - signingBonus) * w) / weightSum)
    );
    year.guaranteedBase = i < guaranteedYears ? year.base : 0;
    return year;
  });
  return c;
}

/** A one-year minimum deal for a veteran with this many credited seasons. */
export function minimumContract(rules: RuleSet, base: Base, season: number, credited: number): Contract {
  const c = contract(base, 'minimum', signedAt(season), 0);
  c.years = [{ ...emptyYear(season), base: minimumSalary(rules, credited) }];
  return c;
}

/** A practice squad deal at the weekly rate for the player's accrued seasons (2026 CBA). */
export function practiceSquadContract(
  rules: RuleSet,
  base: Base,
  season: number,
  accrued: number,
  rng: Rng
): Contract {
  const c = contract(base, 'practiceSquad', inLeagueYear(season, 'cutdown'), 0);
  const veteran = accrued > rules.roster.practiceSquadVeteranSeasons;
  c.weeklyPay = veteran
    ? roundK(
        rng.range(rules.pay.practiceSquadVeteranWeeklyMin, rules.pay.practiceSquadVeteranWeeklyMax) / 10
      ) * 10
    : rules.pay.practiceSquadWeekly;
  c.years = [{ ...emptyYear(season), base: c.weeklyPay * rules.pay.paychecks }];
  return c;
}

/**
 * A contract offer (spec 11.6, 19.4): the same base salary each year and a signing bonus, with, optionally,
 * years of fully guaranteed salary from the first, a per-game active roster bonus each year (an incentive
 * paid by games active), void years that spread the bonus on the cap, and a take-it-or-leave-it mark.
 */
export interface Offer {
  years: number;
  salary: number;
  signingBonus: number;
  guaranteedYears?: number;
  perGameBonus?: number;
  voidYears?: number;
  final?: boolean;
}

/** An offer's average a year, as contracts are reported: the salary, the bonus spread over the years, and the per-game bonus. */
export const offerAav = (offer: Offer): number =>
  offer.salary + Math.round(offer.signingBonus / Math.max(1, offer.years)) + (offer.perGameBonus ?? 0);

/**
 * An offer of `aav` a year for `years`, built as NFL deals are (spec 11.3; D-60): a signing bonus of the
 * middle of its tier's share of the total, guaranteed salary for its tier's years, void years to spread the
 * bonus, within the proration limit, and the rest as the same salary each year, never under `minimum`. The AI
 * makes its offers this way, so a release, or a deal running out with bonus left, leaves dead money.
 */
export function typicalOffer(rules: RuleSet, years: number, aav: number, minimum: number): Offer {
  const C = TUNING.contracts;
  const step = TUNING.market.quoteStep;
  const tier = <T extends { minApy: number }>(table: readonly T[]) => table.find(t => aav >= t.minApy);
  const [low, high] = tier(C.bonusShare)?.range ?? [0, 0];
  const signingBonus = Math.round((aav * years * (low + high)) / 2 / step) * step;
  const salary = Math.max(minimum, Math.round((aav * years - signingBonus) / years / step) * step);
  const guaranteedYears = Math.min(years, tier(C.guaranteedYears)?.years ?? 0);
  const voidYears = signingBonus ? Math.min(Math.max(0, rules.pay.prorationYearsMax - years), tier(C.voidYears)?.years ?? 0) : 0; // prettier-ignore
  return { years, salary, signingBonus, ...(guaranteedYears ? { guaranteedYears } : {}), ...(voidYears ? { voidYears } : {}) }; // prettier-ignore
}

/**
 * Why an offer's terms can't be made (spec 11.6), or null: 1 to the most years, whole dollars, at least
 * `minimum` a year, guaranteed salary for no more years than the deal, and void years only to spread a
 * signing bonus over the years proration allows.
 */
export function termsProblem(rules: RuleSet, offer: Offer, minimum: number): string | null {
  const max = TUNING.contracts.acceptance.maxYears;
  if (!Number.isInteger(offer.years) || offer.years < 1 || offer.years > max) return `Offer 1 to ${max} years.`;
  if (!Number.isInteger(offer.salary) || offer.salary < minimum) return `His minimum salary is ${dollars(minimum)} a year.`;
  if (!Number.isInteger(offer.signingBonus) || offer.signingBonus < 0) return 'The signing bonus must be a whole-dollar amount, zero or more.';
  const guaranteed = offer.guaranteedYears ?? 0;
  if (!Number.isInteger(guaranteed) || guaranteed < 0 || guaranteed > offer.years) return `Guarantee his salary for 0 to ${plural(offer.years, 'year')}.`;
  const perGame = offer.perGameBonus ?? 0;
  if (!Number.isInteger(perGame) || perGame < 0) return 'The per-game roster bonus must be a whole-dollar amount, zero or more.';
  const voids = offer.voidYears ?? 0;
  const room = Math.max(0, rules.pay.prorationYearsMax - offer.years);
  if (!Number.isInteger(voids) || voids < 0 || voids > room)
    return room ? `Add up to ${plural(room, 'void year')}: a bonus spreads over ${rules.pay.prorationYearsMax} years at most.` : `A ${offer.years}-year deal already spreads its bonus over the most years it can.`;
  if (voids > 0 && offer.signingBonus === 0) return 'Void years only spread a signing bonus: add one, or drop the void years.';
  return null;
} // prettier-ignore

/** An offer's years, with its guarantees, incentives, and void years (spec 11.6). */
function offerYears(rules: RuleSet, offer: Offer, start: number, credited: number): ContractYear[] {
  const real = Array.from({ length: offer.years }, (_, i) => {
    const base = Math.max(offer.salary, minimumSalary(rules, credited + i));
    return { ...emptyYear(start + i), base, perGameBonus: offer.perGameBonus ?? 0, guaranteedBase: i < (offer.guaranteedYears ?? 0) ? base : 0 };
  });
  const voids = Array.from({ length: offer.voidYears ?? 0 }, (_, i) => ({ ...emptyYear(start + offer.years + i), isVoid: true }));
  return [...real, ...voids];
} // prettier-ignore

/**
 * The contract an offer makes, signed on `date` and running from its league year. Each year's base is the
 * offered salary or the minimum for the player's credited seasons that year, whichever is more.
 */
export function offerContract(
  rules: RuleSet,
  base: Base,
  date: GameDate,
  offer: Offer,
  credited: number
): Contract {
  const start = leagueYear(date);
  const type =
    offer.signingBonus === 0 && offer.salary <= minimumSalary(rules, credited) ? 'minimum' : 'veteran';
  const c = contract(base, type, { ...date }, offer.signingBonus);
  c.years = offerYears(rules, offer, start, credited);
  return c;
}

/** A practice squad deal signed on `date`, at a weekly rate through the rest of the season. */
export function practiceSquadSigning(
  rules: RuleSet,
  base: Base,
  date: GameDate,
  weeklyPay: number
): Contract {
  const c = contract(base, 'practiceSquad', { ...date }, 0);
  c.weeklyPay = weeklyPay;
  c.years = [{ ...emptyYear(leagueYear(date)), base: weeklyPay * rules.pay.paychecks }];
  return c;
}

/**
 * An extension (spec 11.3): a new deal signed on `date` that starts when his current one runs out, at the
 * next league year, when he'll have `credited` seasons. Each year's base is the salary or the minimum then,
 * whichever is more.
 */
export function extensionContract(
  rules: RuleSet,
  base: Base,
  date: GameDate,
  offer: Offer,
  credited: number
): Contract {
  const start = leagueYear(date) + 1;
  const c = contract(base, 'extension', { ...date }, offer.signingBonus);
  c.years = offerYears(rules, offer, start, credited);
  return c;
}

/**
 * A one-year deal for next league year from a tag or a tender (spec 11.5): tags are fully guaranteed, and
 * tenders aren't.
 */
export function rightsContract(
  base: Base,
  date: GameDate,
  type: 'franchiseTag' | 'transitionTag' | 'rfaTender',
  salary: number
): Contract {
  const c = contract(base, type, { ...date }, 0);
  const year = { ...emptyYear(leagueYear(date) + 1), base: salary };
  if (type !== 'rfaTender') year.guaranteedBase = salary;
  c.years = [year];
  return c;
}
