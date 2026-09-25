/**
 * Cap accounting basics (spec 11.2): the cap hit of a contract in a league year. M8 adds dead money,
 * June 1 designations, restructures, and void-year acceleration on top of these.
 */
import type { RuleSet } from '../rules/ruleset';
import type { Contract } from './types';

/** League years the signing bonus prorates over: the first years of the deal, void years included. */
export function prorationYears(contract: Contract, rules: RuleSet): number[] {
  return contract.years.slice(0, rules.pay.prorationYearsMax).map(y => y.year);
}

/** Signing bonus proration charged in a league year. Integer dollars; the first year absorbs rounding. */
export function signingBonusProration(contract: Contract, year: number, rules: RuleSet): number {
  const years = prorationYears(contract, rules);
  const index = years.indexOf(year);
  if (index < 0 || contract.signingBonus === 0) return 0;
  const share = Math.floor(contract.signingBonus / years.length);
  return index === 0 ? contract.signingBonus - share * (years.length - 1) : share;
}

/** The cap hit in a league year, assuming the player stays on the roster all season. */
export function capHit(contract: Contract, year: number, rules: RuleSet): number {
  const entry = contract.years.find(y => y.year === year);
  const proration = signingBonusProration(contract, year, rules);
  if (!entry || entry.isVoid) return proration;
  if (contract.type === 'practiceSquad') return contract.weeklyPay * rules.pay.paychecks;
  const likely = entry.incentives.filter(i => i.likely).reduce((a, i) => a + i.amount, 0);
  return entry.base + entry.rosterBonus + entry.workoutBonus + entry.perGameBonus + likely + proration;
}

/** Total cap hits for a set of contracts in a league year. */
export function teamCapTotal(contracts: readonly Contract[], year: number, rules: RuleSet): number {
  return contracts.reduce((sum, c) => sum + capHit(c, year, rules), 0);
}

/** Money the player still receives from this league year on (base, bonuses, and unpaid signing bonus). */
export function remainingValue(contract: Contract, fromYear: number): number {
  return contract.years
    .filter(y => y.year >= fromYear && !y.isVoid)
    .reduce((sum, y) => sum + y.base + y.rosterBonus + y.workoutBonus + y.perGameBonus, 0);
}
