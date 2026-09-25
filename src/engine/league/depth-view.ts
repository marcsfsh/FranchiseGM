/**
 * The depth chart as the user sees and edits it (spec 12.2, style guide 7.4): every slot's players in order,
 * and moves that keep a player from starting at two slots of the same unit.
 */
import type { TeamAbbr } from '../../data/team-colors';
import { recipeFor, roleRating } from '../fit/role-rating';
import { fullName } from '../model/player';
import { DEFENSE_SLOTS, OFFENSE_SLOTS, SLOT_LABELS, SPECIAL_SLOTS, type Slot } from '../schemes/slots';
import { available, depthChart } from '../sim/setup';
import type { DepthOrder } from './depth';
import { leagueFitContext } from './fit';
import type { League } from './types';

/** A player on a slot's depth list. */
export interface DepthRow {
  id: string;
  /** Role rating and fit at the slot (spec 7.3). */
  rating: number;
  fit: number;
  /** Plays this week: active, not held out by an injury, and not resting. */
  available: boolean;
}

const unitOf = (slot: Slot): 'offense' | 'defense' | 'special' =>
  (OFFENSE_SLOTS as readonly string[]).includes(slot)
    ? 'offense'
    : (DEFENSE_SLOTS as readonly string[]).includes(slot)
      ? 'defense'
      : 'special';

/**
 * Every slot's players in depth order: the order's players first, then this week's depth chart as the
 * sim builds it (the snap-ordered lineup and role ratings), then players who can't play, by role rating.
 */
export function depthRows(league: League, abbr: TeamAbbr): Record<Slot, DepthRow[]> {
  const roster = Object.values(league.players).filter(p => p.team === abbr && p.status === 'active');
  const ctx = leagueFitContext(league, abbr);
  const can = new Set(roster.filter(p => available(league, p)).map(p => p.id));
  const order = league.teams[abbr].depth.order;
  const effective = depthChart(
    roster.filter(p => can.has(p.id)),
    ctx,
    {},
    order
  );
  const rows = {} as Record<Slot, DepthRow[]>;
  for (const slot of [...OFFENSE_SLOTS, ...DEFENSE_SLOTS, ...SPECIAL_SLOTS]) {
    const eligible = recipeFor(ctx, slot).eligible;
    const rated = roster
      .filter(p => eligible.includes(p.position))
      .map(p => ({ p, role: roleRating(p, slot, ctx) }))
      .sort((a, b) => b.role.rating - a.role.rating || (a.p.id < b.p.id ? -1 : 1));
    const byId = new Map(rated.map(r => [r.p.id, r]));
    const ids = [
      ...new Set([...(order[slot] ?? []), ...(effective[slot] ?? []), ...rated.map(r => r.p.id)])
    ].filter(id => byId.has(id));
    rows[slot] = ids.map(id => {
      const r = byId.get(id) as (typeof rated)[number];
      return { id, rating: r.role.rating, fit: r.role.fit, available: can.has(id) };
    });
  }
  return rows;
}

export interface DepthMove {
  order: DepthOrder;
  /** Who starts at the slot after the move: the first listed player who can play, or null. */
  starter: string | null;
  /** Every other slot whose starter the move changed, in plain sentences for the announcement. */
  notes: string[];
}

/** The league with one team's depth chart order replaced, for comparing lineups before and after. */
const withOrder = (league: League, abbr: TeamAbbr, order: DepthOrder): League => ({
  ...league,
  teams: { ...league.teams, [abbr]: { ...league.teams[abbr], depth: { ...league.teams[abbr].depth, order } } }
});

/**
 * Moves a player to a place on a slot's list (0 is the top). A player starts at one offensive and one
 * defensive slot at most, so a new starter here leaves any other slot of the same unit where he was listed
 * first. The notes name every other slot whose starter changed, including slots the lineup fills itself.
 */
export function moveInDepth(league: League, abbr: TeamAbbr, slot: Slot, id: string, to: number): DepthMove {
  const before = depthRows(league, abbr);
  const can = new Set(Object.values(before).flatMap(list => list.filter(r => r.available).map(r => r.id)));
  const ids = (before[slot] ?? []).map(r => r.id).filter(x => x !== id);
  ids.splice(Math.max(0, Math.min(ids.length, to)), 0, id);
  const order: DepthOrder = { ...league.teams[abbr].depth.order, [slot]: ids };
  const starter = ids.find(x => can.has(x)) ?? null;
  const unit = unitOf(slot);
  if (starter && unit !== 'special')
    for (const other of Object.keys(order) as Slot[]) {
      if (other === slot || unitOf(other) !== unit) continue;
      const list = order[other] ?? [];
      if (list.find(x => can.has(x)) === starter) order[other] = list.filter(x => x !== starter);
    }
  const after = depthRows(withOrder(league, abbr, order), abbr);
  const first = (rows: Record<Slot, DepthRow[]>, s: Slot) => rows[s]?.find(r => r.available)?.id;
  const name = (pid: string | undefined) => {
    const p = pid ? league.players[pid] : undefined;
    return p ? fullName(p) : 'nobody';
  };
  const notes: string[] = [];
  for (const other of Object.keys(after) as Slot[]) {
    if (other === slot) continue;
    const was = first(before, other);
    const now = first(after, other);
    if (was === now) continue;
    notes.push(
      `${name(now)} now starts at ${SLOT_LABELS[other].toLowerCase()}${was ? ` in place of ${name(was)}` : ''}.`
    );
  }
  return { order, starter, notes };
}

/** A starter the head coach would pick where the user's chart has someone else (spec 19.3's advisor). */
export interface DepthAdvice {
  slot: Slot;
  playerId: string;
  /** The user's starter there now, or null if the slot has nobody who can play. */
  replaces: string | null;
}

/**
 * The head coach's suggestions for the user's depth chart: `coach` holds the starters he'd choose from the
 * players who can play this week (ai/decisions/depth-chart.ts); each slot where they differ from the
 * user's current starter is a suggestion, in the order the slots are listed.
 */
export function depthAdvice(
  league: League,
  abbr: TeamAbbr,
  coach: Partial<Record<Slot, string>>
): DepthAdvice[] {
  const rows = depthRows(league, abbr);
  const advice: DepthAdvice[] = [];
  for (const slot of [...OFFENSE_SLOTS, ...DEFENSE_SLOTS] as Slot[]) {
    const pick = coach[slot];
    if (!pick) continue;
    const current = rows[slot]?.find(r => r.available)?.id ?? null;
    if (current !== pick) advice.push({ slot, playerId: pick, replaces: current });
  }
  return advice;
}
