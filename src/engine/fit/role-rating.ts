/**
 * Role ratings and fit (spec 7.3). Role rating = base + trait adjustments + ability value, capped to a
 * rating. The base is the role's weighted rating average, measured from the typical player at the role's
 * primary position and stretched like the overall formulas, so a typical player's base equals his overall.
 * Fit = role rating minus overall, capped at the league's fit cap.
 */
import { ability } from '../abilities/catalog';
import { NO_COACH_EFFECTS, type CoachEffects } from '../abilities/coaches';
import { abilityWorth } from '../abilities/value';
import type { Player } from '../model/player';
import { samePosition } from '../model/positions';
import { clampRating, type RatingKey } from '../model/ratings';
import {
  referenceProfile,
  specialRole,
  type ResolvedDefense,
  type ResolvedOffense,
  type SlotRole
} from '../schemes/resolve';
import { SPECIAL_PROFILE, type PlayTrigger, type SituationShares } from '../schemes/situations';
import {
  DEFENSE_SLOTS,
  OFFENSE_SLOTS,
  type DefenseSlot,
  type OffenseSlot,
  type Slot,
  type SpecialSlot
} from '../schemes/slots';
import { TUNING } from '../tuning';
import { REFERENCES } from './reference';

export interface FitContext {
  offense: ResolvedOffense;
  defense: ResolvedDefense;
  /** Fit cap in points (league setting, spec 7.3). */
  cap: number;
  /** The team's coach abilities (spec 7.6); none when rating players for another team's view. */
  coaches?: CoachEffects;
}

export type FitPlayer = Pick<Player, 'position' | 'ratings' | 'traits' | 'abilities' | 'ovr'>;

export interface TraitMatch {
  label: string;
  points: number;
  /** A role recipe adjustment, or a coach ability boosting the trait. */
  source: 'role' | 'coach';
}

export interface AbilityMatch {
  id: string;
  name: string;
  points: number;
  /** Trigger rate relative to the named-scheme average for this slot. */
  ratio: number;
}

export interface RoleRating {
  slot: Slot;
  label: string;
  /** Role rating, 0 to 99, and never more than the fit cap from the player's overall (spec 7.3). */
  rating: number;
  /** Role rating minus overall. */
  fit: number;
  /** True when the fit cap bound the role rating. */
  capped: boolean;
  /** Uncapped parts in points: ratings (base minus overall), trait adjustments, and ability value. */
  parts: { ratings: number; traits: number; abilities: number };
  /** Of those parts, the points coach abilities add (spec 7.6 cohesion). */
  coach: number;
  /**
   * The role's ratings where the player is above (strengths) or below (weaknesses) the role's typical
   * player, in role rating points, largest first. The breakdown names these.
   */
  strengths: { key: RatingKey; points: number }[];
  weaknesses: { key: RatingKey; points: number }[];
  traits: TraitMatch[];
  abilities: AbilityMatch[];
}

const isOffense = (slot: Slot): slot is OffenseSlot => (OFFENSE_SLOTS as readonly string[]).includes(slot);
const isDefense = (slot: Slot): slot is DefenseSlot => (DEFENSE_SLOTS as readonly string[]).includes(slot);

/** The recipe a scheme uses in a slot. */
export function recipeFor(ctx: Pick<FitContext, 'offense' | 'defense'>, slot: Slot): SlotRole {
  if (isOffense(slot)) return ctx.offense.roles[slot];
  if (isDefense(slot)) return ctx.defense.roles[slot];
  return specialRole(slot as SpecialSlot);
}

function sharesFor(
  ctx: Pick<FitContext, 'offense' | 'defense'>,
  slot: Slot
): [SituationShares, SituationShares] {
  if (isOffense(slot)) return [ctx.offense.profile[slot], referenceProfile().offense[slot]];
  if (isDefense(slot)) return [ctx.defense.profile[slot], referenceProfile().defense[slot]];
  const shares = SPECIAL_PROFILE[slot as SpecialSlot];
  return [shares, shares];
}

function multipliersFor(coaches: CoachEffects, slot: Slot): Partial<Record<PlayTrigger, number>> {
  if (isOffense(slot)) return coaches.offense;
  if (isDefense(slot)) return coaches.defense;
  return {};
}

/** Rates a player in the role a scheme uses in a slot (spec 7.3). */
export function roleRating(player: FitPlayer, slot: Slot, ctx: FitContext): RoleRating {
  const recipe = recipeFor(ctx, slot);
  const coaches = ctx.coaches ?? NO_COACH_EFFECTS;

  // Ratings: the role's stretched weighted average from its primary position's typical player, compared
  // with the player's own overall measured the same way from his position's typical player.
  const role = REFERENCES[recipe.primary];
  let base = role.typicalOvr;
  const effects: { key: RatingKey; points: number }[] = [];
  for (const [key, weight] of Object.entries(recipe.weights) as [RatingKey, number][]) {
    const points = role.scale * weight * (player.ratings[key] - role.typical[key]);
    base += points;
    effects.push({ key, points });
  }
  const min = TUNING.fit.namedMinPoints;
  const strengths = effects.filter(e => e.points >= min).sort((a, b) => b.points - a.points);
  const weaknesses = effects.filter(e => e.points <= -min).sort((a, b) => a.points - b.points);

  // Traits: the recipe's adjustments, then coach boosts for the player's position. A boost that corrects
  // a bad trait only offsets the penalty this role gives it, so it never makes the trait an asset.
  const traits: TraitMatch[] = [];
  for (const t of recipe.traits)
    if (player.traits[t.trait] === t.value) traits.push({ label: t.label, points: t.points, source: 'role' });
  for (const t of coaches.traits) {
    if (player.traits[t.trait] !== t.value || !t.positions.includes(player.position)) continue;
    if (!t.offsets) {
      traits.push({ label: t.label, points: t.points, source: 'coach' });
      continue;
    }
    const penalty = recipe.traits.find(r => r.trait === t.trait && r.value === t.value && r.points < 0);
    if (penalty)
      traits.push({ label: t.label, points: Math.min(t.points, -penalty.points), source: 'coach' });
  }

  // Abilities: tier points scaled by how often this scheme triggers them for the slot.
  const [shares, reference] = sharesFor(ctx, slot);
  const multipliers = multipliersFor(coaches, slot);
  const abilities: AbilityMatch[] = [];
  let coachAbilityPoints = 0;
  for (const id of player.abilities) {
    const ab = ability(id);
    if (!ab) continue;
    const worth = abilityWorth(ab, shares, reference, multipliers);
    const plain = abilityWorth(ab, shares, reference);
    coachAbilityPoints += worth.points - plain.points;
    abilities.push({ id, name: ab.name, points: worth.points, ratio: worth.ratio });
  }

  const traitPoints = traits.reduce((sum, t) => sum + t.points, 0);
  const abilityPoints = abilityPointsTotal(abilities);
  // Capped: never more than the fit cap from his overall, and a valid rating (spec 7.3).
  const raw = Math.round(base + traitPoints + abilityPoints);
  const rating = clampRating(Math.max(player.ovr - ctx.cap, Math.min(player.ovr + ctx.cap, raw)));
  return {
    slot,
    label: recipe.label,
    rating,
    fit: rating - player.ovr,
    capped: rating !== clampRating(raw),
    parts: { ratings: base - player.ovr, traits: traitPoints, abilities: abilityPoints },
    coach:
      coachAbilityPoints + traits.filter(t => t.source === 'coach').reduce((sum, t) => sum + t.points, 0),
    strengths,
    weaknesses,
    traits,
    abilities
  };
}

const abilityPointsTotal = (abilities: readonly AbilityMatch[]): number =>
  abilities.reduce((sum, a) => sum + a.points, 0);

/**
 * Every slot a player's position can fill in a scheme. Roles of his own position (or its mirror, like
 * LT and RT) come first, best role rating first; roles of other positions follow.
 */
export function rolesFor(player: FitPlayer, ctx: FitContext, slots: readonly Slot[]): RoleRating[] {
  const native = (slot: Slot) => samePosition(recipeFor(ctx, slot).primary, player.position);
  return slots
    .filter(slot => recipeFor(ctx, slot).eligible.includes(player.position))
    .map(slot => ({ native: native(slot), role: roleRating(player, slot, ctx) }))
    .sort(
      (a, b) =>
        Number(b.native) - Number(a.native) || b.role.rating - a.role.rating || b.role.fit - a.role.fit
    )
    .map(r => r.role);
}
