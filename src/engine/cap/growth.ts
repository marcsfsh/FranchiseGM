/** The cap's growth from one league year to the next (spec 11.1). */
import type { RuleSet } from '../rules/ruleset';
import { TUNING } from '../tuning';

/**
 * Next league year's cap (spec 11.1): oldCap x (1 + w x fixedRate + (1 - w) x revenueGrowth), the yearly
 * change held within the floor and ceiling.
 */
export function nextCap(rules: RuleSet, revenueGrowth: number): number {
  const c = rules.cap;
  const growth = c.growthFixedWeight * c.growthFixedRate + (1 - c.growthFixedWeight) * revenueGrowth;
  const bounded = Math.min(c.growthCeiling, Math.max(c.growthFloor, growth));
  const step = TUNING.leagueYear.capRound;
  return Math.round((c.amount * (1 + bounded)) / step) * step;
}

/** Next league year's cap as expected before it opens: grown by league revenue's mean growth. */
export const expectedNextCap = (rules: RuleSet): number => nextCap(rules, TUNING.leagueYear.revenueGrowth[0]);
