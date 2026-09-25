/**
 * Market value of a veteran (spec 11.6): average annual value by position, overall, and age, scaled to
 * the cap. The full negotiation model (M12) builds on this.
 */
import type { Position } from '../model/positions';
import { POSITION_GROUP } from '../model/positions';
import { minimumSalary, type RuleSet } from '../rules/ruleset';
import { TUNING } from '../tuning';

const M = TUNING.market;

/** Last age before pay starts to fall, by position group. */
export function primeAge(position: Position): number {
  const group = POSITION_GROUP[position];
  return group === 'QB' || group === 'ST' ? 33 : group === 'RB' ? 27 : 29;
}

/** Average annual value in dollars for a veteran with this many credited seasons. */
export function marketValue(
  rules: RuleSet,
  position: Position,
  ovr: number,
  age: number,
  credited: number
): number {
  const floor = minimumSalary(rules, credited);
  const top = rules.cap.amount * M.topShare[position];
  const mid = position === 'QB' ? M.midOverallQb : M.midOverall;
  const curve = 1 / (1 + Math.exp(-(ovr - mid) / M.width));
  const age0 = primeAge(position);
  const ageFactor = Math.max(0.4, 1 - Math.max(0, age - age0) * M.ageDiscountPerYear);
  // Deals are quoted in $5,000 steps.
  return Math.max(floor, Math.round((floor + (top - floor) * curve * ageFactor) / 5000) * 5000);
}

/** Signing bonus for a rookie drafted at this overall pick (spec 11.4). */
export function rookieSigningBonus(rules: RuleSet, pick: number): number {
  const r = rules.rookieScale;
  const bonus =
    pick <= 32
      ? r.topSigningBonus * Math.pow(pick, -r.firstRoundDecay)
      : r.topSigningBonus * Math.pow(32, -r.firstRoundDecay) * Math.exp(-(pick - 32) / r.laterPickScale);
  return Math.max(r.minimumSigningBonus, Math.round(bonus / 1000) * 1000);
}

/** The most a deal at this position can pay per year. */
export function marketCeiling(rules: RuleSet, position: Position): number {
  return Math.round((rules.cap.amount * M.topShare[position] * (1 + M.topOverage)) / 5000) * 5000;
}
