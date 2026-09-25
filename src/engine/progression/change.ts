/**
 * Every rating change goes through here with its cause (post-M23 section 1.1, preparing section 2.14's
 * progression history): ratings move within 0 to 99, the overall is recomputed, and a record of what moved,
 * when, why, and the largest contributions comes back for the caller to keep or pass on.
 */
import type { GameDate } from '../model/calendar';
import type { Player } from '../model/player';
import type { RatingKey } from '../model/ratings';
import { overall } from '../ratings/overall';

/** Why ratings moved: weekly in-season development, the offseason, training camp, or an injury. */
export type RatingCause = 'weekly' | 'offseason' | 'camp' | 'injury';

/** One driver's share of a change, such as the age curve or playing time, in rating points. */
export interface RatingDriver {
  id: string;
  amount: number;
}

export interface RatingChange {
  playerId: string;
  date: GameDate;
  cause: RatingCause;
  /** The ratings that moved, and by how much. */
  deltas: Partial<Record<RatingKey, number>>;
  ovr: { before: number; after: number };
  /** The largest contributions, biggest first, so a history can explain the change. */
  drivers: RatingDriver[];
}

/** Drivers a change keeps. */
const KEPT_DRIVERS = 3;

/**
 * Moves a player's ratings by whole points, each kept within 0 to 99, and recomputes his overall. Returns
 * the change, or null when nothing moved.
 */
export function changeRatings(
  player: Player,
  deltas: Partial<Record<RatingKey, number>>,
  cause: RatingCause,
  date: GameDate,
  drivers: readonly RatingDriver[] = []
): RatingChange | null {
  const moved: Partial<Record<RatingKey, number>> = {};
  for (const [key, delta] of Object.entries(deltas) as [RatingKey, number][]) {
    const before = player.ratings[key];
    const after = Math.min(99, Math.max(0, Math.round(before + delta)));
    if (after === before) continue;
    player.ratings[key] = after;
    moved[key] = after - before;
  }
  if (!Object.keys(moved).length) return null;
  const before = player.ovr;
  player.ovr = overall(player.position, player.ratings);
  return {
    playerId: player.id,
    date: { ...date },
    cause,
    deltas: moved,
    ovr: { before, after: player.ovr },
    drivers: [...drivers]
      .filter(d => d.amount !== 0)
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount) || (a.id < b.id ? -1 : 1))
      .slice(0, KEPT_DRIVERS)
  };
}
