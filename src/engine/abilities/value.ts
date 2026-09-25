/**
 * Ability value (spec 7.3, third layer): an ability's fit contribution is its strength times how often
 * the scheme creates its triggers for the role. Strength is set so an ability is worth its tier points in
 * a scheme that triggers it as often as the named schemes do on average.
 */
import { TUNING } from '../tuning';
import {
  CONTEXT_SHARES,
  type ContextShares,
  type PlayTrigger,
  type SituationShares
} from '../schemes/situations';
import type { Ability } from './catalog';

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/**
 * Share of a role's snaps on which the ability triggers: any of its play situations, inside any of its
 * contexts when it has them. Coach multipliers scale play situations (spec 7.6).
 */
export function triggerRate(
  ability: Pick<Ability, 'triggers' | 'contexts'>,
  shares: SituationShares,
  multipliers: Partial<Record<PlayTrigger, number>> = {},
  contexts: ContextShares = CONTEXT_SHARES
): number {
  let miss = 1;
  for (const t of ability.triggers) miss *= 1 - clamp01(shares[t] * (multipliers[t] ?? 1));
  const play = 1 - miss;
  if (!ability.contexts?.length) return play;
  let outside = 1;
  for (const c of ability.contexts) outside *= 1 - contexts[c];
  return play * (1 - outside);
}

export interface AbilityWorth {
  /** Role rating points. */
  points: number;
  /** How often it triggers here relative to the named-scheme average for the slot. */
  ratio: number;
}

/** An ability's role rating points in a slot, given the scheme's and the reference profiles. */
export function abilityWorth(
  ability: Ability,
  shares: SituationShares,
  reference: SituationShares,
  multipliers: Partial<Record<PlayTrigger, number>> = {}
): AbilityWorth {
  const base = triggerRate(ability, reference);
  if (base <= 0) return { points: 0, ratio: 0 };
  const ratio = triggerRate(ability, shares, multipliers) / base;
  const A = TUNING.abilities;
  return { points: (A.tierPoints[ability.tier] ?? 0) * Math.min(A.maxFrequencyRatio, ratio), ratio };
}
