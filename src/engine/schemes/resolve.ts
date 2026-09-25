/**
 * Resolves a team's scheme choice (a named scheme or a blend of two, spec 7.2) into tendencies, a role
 * recipe per depth chart slot, and a situation profile. Results are cached by choice.
 */
import measured from '../../data/situation-profiles.json';
import { DEFENSES, DEFENSE_LIST, OFFENSES, OFFENSE_LIST, SPECIAL_ROLES } from './catalog';
import type { DefenseSchemeId, OffenseSchemeId } from './ids';
import { ROLES, type RatingWeights, type RoleId, type RoleRecipe, type TraitAdjustment } from './roles';
import {
  estimateDefenseProfile,
  estimateOffenseProfile,
  PLAY_TRIGGERS,
  type DefenseProfile,
  type OffenseProfile,
  type SituationShares
} from './situations';
import { DEFENSE_SLOTS, OFFENSE_SLOTS, type DefenseSlot, type OffenseSlot, type SpecialSlot } from './slots';
import { blendDefense, blendOffense, type DefenseTendencies, type OffenseTendencies } from './tendencies';

/** One side's scheme: a named scheme, optionally blended with a second one (spec 7.2). */
export interface SchemeChoice<Id extends string> {
  base: Id;
  /** The second scheme of a blend, or null for a named scheme. */
  blend: Id | null;
  /** The base scheme's weight in a blend, from 0.5 to 1. */
  weight: number;
}

export type OffenseChoice = SchemeChoice<OffenseSchemeId>;
export type DefenseChoice = SchemeChoice<DefenseSchemeId>;

export interface TeamSchemes {
  offense: OffenseChoice;
  defense: DefenseChoice;
}

export const named = <Id extends string>(id: Id): SchemeChoice<Id> => ({ base: id, blend: null, weight: 1 });

/** A slot's recipe, with the named roles it mixes (one for a named scheme, up to two for a blend). */
export interface SlotRole extends RoleRecipe {
  roleIds: readonly RoleId[];
}

export interface ResolvedOffense {
  choice: OffenseChoice;
  name: string;
  tendencies: OffenseTendencies;
  roles: Record<OffenseSlot, SlotRole>;
  profile: OffenseProfile;
}

export interface ResolvedDefense {
  choice: DefenseChoice;
  name: string;
  tendencies: DefenseTendencies;
  roles: Record<DefenseSlot, SlotRole>;
  profile: DefenseProfile;
}

const isBlend = <Id extends string>(c: SchemeChoice<Id>): c is SchemeChoice<Id> & { blend: Id } =>
  c.blend !== null && c.blend !== c.base && c.weight < 1;

/** Mixes two recipes: weights and trait points are weighted averages; labels come from the heavier one. */
export function blendRecipes(a: RoleRecipe, b: RoleRecipe, w: number): RoleRecipe {
  const weights: RatingWeights = {};
  for (const [key, value] of Object.entries(a.weights)) weights[key as keyof RatingWeights] = value * w;
  for (const [key, value] of Object.entries(b.weights)) {
    const k = key as keyof RatingWeights;
    weights[k] = (weights[k] ?? 0) + value * (1 - w);
  }
  const traits = new Map<string, TraitAdjustment>();
  const add = (list: readonly TraitAdjustment[], share: number) => {
    for (const t of list) {
      const id = `${t.trait}:${String(t.value)}`;
      const seen = traits.get(id);
      traits.set(id, { ...(seen ?? t), points: (seen?.points ?? 0) + t.points * share });
    }
  };
  add(a.traits, w);
  add(b.traits, 1 - w);
  const [heavy, light] = w >= 0.5 ? [a, b] : [b, a];
  return {
    label: heavy.label,
    primary: heavy.primary,
    eligible: [...new Set([...heavy.eligible, ...light.eligible])],
    weights,
    traits: [...traits.values()].filter(t => t.points !== 0)
  };
}

function slotRole(a: RoleId, b: RoleId | null, w: number): SlotRole {
  if (!b || a === b) return { ...ROLES[a], roleIds: [a] };
  return { ...blendRecipes(ROLES[a], ROLES[b], w), roleIds: [a, b] };
}

const percent = (w: number): string => `${Math.round(w * 100)}`;

function choiceName<Id extends string>(c: SchemeChoice<Id>, nameOf: (id: Id) => string): string {
  if (!isBlend(c)) return nameOf(c.base);
  return `${nameOf(c.base)} and ${nameOf(c.blend)} blend (${percent(c.weight)}/${percent(1 - c.weight)})`;
}

const key = (c: SchemeChoice<string>): string => (isBlend(c) ? `${c.base}+${c.blend}@${c.weight}` : c.base);

/**
 * Situation profiles measured by running the sim (spec 7.5, tools/measure-profiles.ts). A named scheme
 * uses its measured profile, a blend mixes its two schemes' profiles, and anything unmeasured falls back
 * to the estimate from its tendencies.
 */
interface MeasuredFile {
  offense: Partial<Record<OffenseSchemeId, OffenseProfile>>;
  defense: Partial<Record<DefenseSchemeId, DefenseProfile>>;
}
const MEASURED = measured as unknown as MeasuredFile;

function mixProfiles<S extends string>(
  a: Record<S, SituationShares>,
  b: Record<S, SituationShares>,
  w: number
): Record<S, SituationShares> {
  const out = {} as Record<S, SituationShares>;
  for (const slot of Object.keys(a) as S[]) {
    const shares = {} as SituationShares;
    for (const t of PLAY_TRIGGERS) shares[t] = a[slot][t] * w + (b[slot]?.[t] ?? 0) * (1 - w);
    out[slot] = shares;
  }
  return out;
}

function offenseProfile(id: OffenseSchemeId): OffenseProfile {
  return MEASURED.offense[id] ?? estimateOffenseProfile(OFFENSES[id].tendencies);
}

function defenseProfile(id: DefenseSchemeId): DefenseProfile {
  return MEASURED.defense[id] ?? estimateDefenseProfile(DEFENSES[id].tendencies);
}

const offenseCache = new Map<string, ResolvedOffense>();
const defenseCache = new Map<string, ResolvedDefense>();

export function resolveOffense(choice: OffenseChoice): ResolvedOffense {
  const k = key(choice);
  const cached = offenseCache.get(k);
  if (cached) return cached;
  const a = OFFENSES[choice.base];
  const b = isBlend(choice) ? OFFENSES[choice.blend] : null;
  const w = b ? choice.weight : 1;
  const tendencies = b ? blendOffense(a.tendencies, b.tendencies, w) : a.tendencies;
  const roles = Object.fromEntries(
    OFFENSE_SLOTS.map(slot => [slot, slotRole(a.roles[slot], b?.roles[slot] ?? null, w)])
  ) as Record<OffenseSlot, SlotRole>;
  const resolved: ResolvedOffense = {
    choice,
    name: choiceName(choice, id => OFFENSES[id].name),
    tendencies,
    roles,
    profile: b
      ? mixProfiles(offenseProfile(choice.base), offenseProfile(b.id), w)
      : offenseProfile(choice.base)
  };
  offenseCache.set(k, resolved);
  return resolved;
}

export function resolveDefense(choice: DefenseChoice): ResolvedDefense {
  const k = key(choice);
  const cached = defenseCache.get(k);
  if (cached) return cached;
  const a = DEFENSES[choice.base];
  const b = isBlend(choice) ? DEFENSES[choice.blend] : null;
  const w = b ? choice.weight : 1;
  const tendencies = b ? blendDefense(a.tendencies, b.tendencies, w) : a.tendencies;
  const roles = Object.fromEntries(
    DEFENSE_SLOTS.map(slot => [slot, slotRole(a.roles[slot], b?.roles[slot] ?? null, w)])
  ) as Record<DefenseSlot, SlotRole>;
  const resolved: ResolvedDefense = {
    choice,
    name: choiceName(choice, id => DEFENSES[id].name),
    tendencies,
    roles,
    profile: b
      ? mixProfiles(defenseProfile(choice.base), defenseProfile(b.id), w)
      : defenseProfile(choice.base)
  };
  defenseCache.set(k, resolved);
  return resolved;
}

export const specialRole = (slot: SpecialSlot): SlotRole => ({
  ...ROLES[SPECIAL_ROLES[slot]],
  roleIds: [SPECIAL_ROLES[slot]]
});

function averageProfile<S extends string>(
  profiles: readonly Record<S, SituationShares>[],
  slots: readonly S[]
) {
  const out = {} as Record<S, SituationShares>;
  for (const slot of slots) {
    const shares = {} as SituationShares;
    for (const t of PLAY_TRIGGERS)
      shares[t] = profiles.reduce((sum, p) => sum + p[slot][t], 0) / profiles.length;
    out[slot] = shares;
  }
  return out;
}

/**
 * The named schemes' average profile per slot: an ability is worth its tier points in a scheme that
 * triggers it this often (spec 7.3 ability value).
 */
export const REFERENCE_PROFILE = {
  offense: averageProfile(
    OFFENSE_LIST.map(s => resolveOffense(named(s.id)).profile),
    OFFENSE_SLOTS
  ),
  defense: averageProfile(
    DEFENSE_LIST.map(s => resolveDefense(named(s.id)).profile),
    DEFENSE_SLOTS
  )
};
