/**
 * Scheme cohesion and coaching (spec 7.6): the starting lineup's snap-weighted fit plus how well the
 * staff's abilities line up with the players, coordinator mismatch, and head coach flexibility.
 */
import { coachEffects, type CoachEffects } from '../abilities/coaches';
import type { Player } from '../model/player';
import type { StaffMember } from '../model/staff';
import { DEFENSES, DEFENSE_LIST, OFFENSES, OFFENSE_LIST } from '../schemes/catalog';
import { named, resolveDefense, resolveOffense, type TeamSchemes } from '../schemes/resolve';
import {
  DEFENSE_SLOTS,
  OFFENSE_SLOTS,
  defenseSnapShares,
  offenseSnapShares,
  type DefenseSlot,
  type OffenseSlot,
  type Slot
} from '../schemes/slots';
import {
  blendDefense,
  blendOffense,
  defenseDistance,
  offenseDistance,
  type DefenseTendencies,
  type OffenseTendencies
} from '../schemes/tendencies';
import { TUNING } from '../tuning';
import { recipeFor, roleRating, type FitContext, type FitPlayer, type RoleRating } from './role-rating';

export type LineupPlayer = FitPlayer & Pick<Player, 'id'>;

export interface LineupEntry {
  player: LineupPlayer;
  role: RoleRating;
}

/**
 * The best available player for each slot: every eligible player-slot pair is rated, and the highest
 * role ratings are filled first, one slot per player. The AI depth chart (M7) starts from this.
 */
export function autoLineup(
  players: readonly LineupPlayer[],
  ctx: FitContext,
  slots: readonly Slot[] = [...OFFENSE_SLOTS, ...DEFENSE_SLOTS]
): Map<Slot, LineupEntry> {
  const pairs: LineupEntry[] = [];
  for (const slot of slots) {
    const eligible = recipeFor(ctx, slot).eligible;
    for (const player of players)
      if (eligible.includes(player.position)) pairs.push({ player, role: roleRating(player, slot, ctx) });
  }
  pairs.sort(
    (a, b) => b.role.rating - a.role.rating || b.role.fit - a.role.fit || (a.player.id < b.player.id ? -1 : 1)
  );
  const lineup = new Map<Slot, LineupEntry>();
  const used = new Set<string>();
  for (const pair of pairs) {
    if (lineup.has(pair.role.slot) || used.has(pair.player.id)) continue;
    lineup.set(pair.role.slot, pair);
    used.add(pair.player.id);
  }
  return lineup;
}

export interface SideCohesion {
  /** Snap-weighted average fit of the starters, in points. */
  fit: number;
  /** Snap-weighted average of the points the staff's abilities add to the starters. */
  coaching: number;
  /** fit + coaching, after the flexibility cost, clamped to the cohesion limit. */
  value: number;
  /** Execution modifier for the sim (M4): positive means fewer negative plays, penalties, and busts. */
  execution: number;
}

export interface Cohesion {
  offense: SideCohesion;
  defense: SideCohesion;
}

function side<S extends Slot>(
  lineup: Map<Slot, LineupEntry>,
  shares: Record<S, number>,
  flexibility: number
): SideCohesion {
  const C = TUNING.cohesion;
  let weight = 0;
  let fit = 0;
  let coaching = 0;
  for (const [slot, share] of Object.entries(shares) as [S, number][]) {
    const entry = lineup.get(slot);
    if (!entry || share <= 0) continue;
    weight += share;
    fit += share * entry.role.fit;
    coaching += share * entry.role.coach;
  }
  fit = weight ? fit / weight : 0;
  coaching = weight ? coaching / weight : 0;
  let value = fit + coaching;
  // A flexible coach bends the scheme toward the roster and gives up part of a positive bonus for it.
  if (value > 0) value *= 1 - C.flexibilityCost * (flexibility / 99);
  value = Math.max(-C.limit, Math.min(C.limit, value));
  return { fit, coaching, value, execution: value * C.executionPerPoint };
}

/** A team's cohesion on each side of the ball (spec 7.6). `flexibility` is the head coach's rating. */
export function teamCohesion(lineup: Map<Slot, LineupEntry>, ctx: FitContext, flexibility: number): Cohesion {
  return {
    offense: side<OffenseSlot>(
      lineup,
      offenseSnapShares(ctx.offense.tendencies, TUNING.situations.rb1Share),
      flexibility
    ),
    defense: side<DefenseSlot>(lineup, defenseSnapShares(ctx.defense.tendencies), flexibility)
  };
}

export interface CoordinatorFit {
  coach: StaffMember;
  /** Distance from the team's scheme to his preferred one, 0 (same) to 1. */
  distance: number;
  /** Multipliers on his play calling and development bonuses. */
  playCalling: number;
  development: number;
  /** Morale change when the scheme is set. */
  morale: number;
}

/**
 * Coordinator mismatch (spec 7.6): a coordinator whose preferred scheme differs from the one the head
 * coach runs loses play-calling and development effectiveness in proportion to the distance, and morale.
 */
export function coordinatorFit(coach: StaffMember, schemes: TeamSchemes): CoordinatorFit | null {
  let distance: number;
  if (coach.role === 'OC' && coach.offenseScheme)
    distance = offenseDistance(
      resolveOffense(schemes.offense).tendencies,
      OFFENSES[coach.offenseScheme].tendencies
    );
  else if (coach.role === 'DC' && coach.defenseScheme)
    distance = defenseDistance(
      resolveDefense(schemes.defense).tendencies,
      DEFENSES[coach.defenseScheme].tendencies
    );
  else return null;
  const K = TUNING.coordinators;
  return {
    coach,
    distance,
    playCalling: 1 - K.playCallingPenalty * distance,
    development: 1 - K.developmentPenalty * distance,
    morale: distance > 0 ? -Math.round(K.moraleDrop * distance) : 0
  };
}

function softmax(values: readonly number[], temperature: number): number[] {
  const top = Math.max(...values);
  const exps = values.map(v => Math.exp((v - top) / temperature));
  const total = exps.reduce((a, b) => a + b, 0);
  return exps.map(e => e / total);
}

/** Weighted average of several tendency sets, built from pairwise blends. */
function average<T>(items: readonly [T, number][], blend: (a: T, b: T, w: number) => T): T {
  let [acc, total] = items[0] as [T, number];
  for (const [t, w] of items.slice(1)) {
    if (w <= 0) continue;
    acc = blend(acc, t, total / (total + w));
    total += w;
  }
  return acc;
}

const avgFit = (lineup: Map<Slot, LineupEntry>, slots: readonly Slot[]): number => {
  const fits = slots.flatMap(s => {
    const e = lineup.get(s);
    return e ? [e.role.fit] : [];
  });
  return fits.length ? fits.reduce((a, b) => a + b, 0) / fits.length : 0;
};

export interface Adapted {
  offense: OffenseTendencies;
  defense: DefenseTendencies;
  /** How far the tendencies moved toward the roster, 0 to the maximum bend. */
  bend: number;
}

/**
 * Coach flexibility (spec 7.6): a flexible head coach bends the team's tendencies toward the named
 * schemes the roster fits best; a rigid one runs the scheme as written.
 */
export function adaptedTendencies(
  players: readonly LineupPlayer[],
  ctx: FitContext,
  flexibility: number
): Adapted {
  const C = TUNING.cohesion;
  const bend = C.maxBend * (flexibility / 99);
  if (bend <= 0) return { offense: ctx.offense.tendencies, defense: ctx.defense.tendencies, bend: 0 };
  const offenseFits = OFFENSE_LIST.map(s =>
    avgFit(
      autoLineup(players, { ...ctx, offense: resolveOffense(named(s.id)) }, OFFENSE_SLOTS),
      OFFENSE_SLOTS
    )
  );
  const defenseFits = DEFENSE_LIST.map(s =>
    avgFit(
      autoLineup(players, { ...ctx, defense: resolveDefense(named(s.id)) }, DEFENSE_SLOTS),
      DEFENSE_SLOTS
    )
  );
  const offenseWeights = softmax(offenseFits, C.rosterTemperature);
  const defenseWeights = softmax(defenseFits, C.rosterTemperature);
  const rosterOffense = average<OffenseTendencies>(
    OFFENSE_LIST.map((s, i) => [s.tendencies, offenseWeights[i] as number]),
    blendOffense
  );
  const rosterDefense = average<DefenseTendencies>(
    DEFENSE_LIST.map((s, i) => [s.tendencies, defenseWeights[i] as number]),
    blendDefense
  );
  return {
    offense: blendOffense(ctx.offense.tendencies, rosterOffense, 1 - bend),
    defense: blendDefense(ctx.defense.tendencies, rosterDefense, 1 - bend),
    bend
  };
}

/** A team's fit context: its schemes, the league's fit cap, and its staff's abilities. */
export function teamFitContext(schemes: TeamSchemes, cap: number, staff: readonly StaffMember[]): FitContext {
  const coaches: CoachEffects = coachEffects(staff);
  return { offense: resolveOffense(schemes.offense), defense: resolveDefense(schemes.defense), cap, coaches };
}
