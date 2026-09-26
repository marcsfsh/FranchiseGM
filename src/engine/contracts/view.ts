/**
 * A contract year by year for the contract screen (spec 11.2): each remaining league year's cap hit and
 * its parts, the cash paid that year, and what releasing the player would do: as the league year opens
 * (or today, before June 1), when everything accelerates, and after June 1 (or with a designation), when
 * later years' dead money moves to the next league year; each with the cap space it saves that year.
 */
import { leagueYear, type GameDate } from '../model/calendar';
import type { RuleSet } from '../rules/ruleset';
import {
  afterJune1,
  capCharge,
  earnedBonuses,
  guaranteedAt,
  leagueYearStart,
  paidBase,
  releaseImpact,
  type CapFacts
} from './cap';
import type { Contract } from './types';

export interface ReleaseView {
  deadNow: number;
  deadNext: number;
  savings: number;
}

export interface ContractYearView {
  year: number;
  isVoid: boolean;
  base: number;
  /** Roster, workout, and per-game roster bonuses, and likely incentives. */
  bonuses: number;
  proration: number;
  capHit: number;
  /** Money paid in the league year: salary and bonuses earned, and bonuses paid out when signed. */
  cash: number;
  /** Released as the league year opens (or today, before June 1); null when that's past. */
  cutEarly: ReleaseView | null;
  /** Released after June 1, or with a June 1 designation. */
  cutLate: ReleaseView | null;
}

export interface ContractSummary {
  /** Money over the deal's real years: salaries, bonuses, and the signing bonus. */
  total: number;
  years: number;
  /** Average per year. */
  apy: number;
  /** Guaranteed at signing: the signing bonus and fully guaranteed salary. */
  guaranteed: number;
  /** Real years left from the current league year. */
  remaining: number;
}

const realYears = (c: Contract) => c.years.filter(y => !y.isVoid);

export function contractSummary(c: Contract, today: GameDate): ContractSummary {
  const real = realYears(c);
  const total =
    c.signingBonus +
    real.reduce(
      (sum, y) => sum + y.base + y.rosterBonus + y.workoutBonus + y.perGameBonus + y.optionBonus,
      0
    );
  return {
    total,
    years: real.length,
    apy: real.length ? Math.round(total / real.length) : 0,
    guaranteed: c.signingBonus + real.reduce((sum, y) => sum + y.guaranteedBase, 0),
    remaining: real.filter(y => y.year >= leagueYear(today)).length
  };
}

/**
 * Cash paid in a league year: salary for the weeks in force, bonuses and incentives as they're earned, the
 * signing bonus at signing, an exercised option's bonus, and salary converted by a restructure, paid as a
 * bonus when converted. After a release the salary still owed is paid on its usual schedule: the rest of
 * that year's guarantee (all of it with termination pay) and later years' guarantees.
 */
export function cashIn(c: Contract, year: number, rules: RuleSet, facts: CapFacts): number {
  const entry = c.years.find(y => y.year === year);
  if (!entry || entry.isVoid) return 0;
  const end = c.ended;
  const endYear = end ? leagueYear(end.date) : null;
  const released = end?.how === 'released' ? end : null;
  if (endYear !== null && year > endYear) return released ? guaranteedAt(c, entry, released.date, released.injured) : 0;
  const signed = leagueYear(c.signed) === year ? c.signingBonus : 0;
  const option = entry.optionExercised ? entry.optionBonus : 0;
  const converted = c.restructures.filter(r => leagueYear(r.date) === year).reduce((sum, r) => sum + r.amount, 0);
  const incentives = entry.incentives.filter(i => i.earned).reduce((sum, i) => sum + i.amount, 0);
  const paid = paidBase(c, entry, rules);
  const owed = released ? Math.max(0, (released.terminationPay ? entry.base : guaranteedAt(c, entry, released.date, released.injured)) - paid) : 0;
  return paid + owed + earnedBonuses(c, year, rules, facts) + incentives + signed + option + converted;
} // prettier-ignore

const view = (
  c: Contract,
  date: GameDate,
  rules: RuleSet,
  facts: CapFacts,
  designated = false
): ReleaseView => {
  const impact = releaseImpact(c, date, rules, { designated }, facts);
  return { deadNow: impact.deadNow, deadNext: impact.deadNext, savings: impact.savings };
};

/** The deal's league years from today's on. */
export function contractView(
  c: Contract,
  today: GameDate,
  rules: RuleSet,
  facts: CapFacts = {}
): ContractYearView[] {
  const current = leagueYear(today);
  return c.years
    .filter(y => y.year >= current)
    .map(entry => {
      const charge = capCharge(c, entry.year, rules, facts);
      const now = entry.year === current;
      // A release as this league year opens, and one in its training camp, after June 1.
      const opening = now ? today : leagueYearStart(entry.year);
      const camp: GameDate = { season: entry.year - 1, phase: 'trainingCamp', week: 1 };
      let cutEarly: ReleaseView | null = null;
      let cutLate: ReleaseView | null = null;
      if (!entry.isVoid && !c.ended) {
        if (now && afterJune1(today, rules)) cutLate = view(c, today, rules, facts);
        else {
          cutEarly = view(c, opening, rules, facts);
          cutLate = now ? view(c, today, rules, facts, true) : view(c, camp, rules, facts);
        }
      }
      return {
        year: entry.year,
        isVoid: entry.isVoid,
        base: charge.base,
        bonuses: charge.bonuses,
        proration: charge.proration,
        capHit: charge.total,
        cash: cashIn(c, entry.year, rules, facts),
        cutEarly,
        cutLate
      };
    });
}
