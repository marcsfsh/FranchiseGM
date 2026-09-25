/**
 * Injuries between games (spec 10.8): new injuries from a week's games, healing week by week, the weekly
 * designation, lingering effects and re-injury risk after a return, and rare career-altering injuries.
 */
import type { League } from '../league/types';
import type { Player } from '../model/player';
import type { RatingKey } from '../model/ratings';
import { changeRatings, type RatingChange } from '../progression/change';
import type { Rng } from '../rng';
import type { InjuryEvent, InjurySeverity } from '../sim/types';
import { TUNING } from '../tuning';

const I = TUNING.injuries;

export type InjuryDesignation = 'out' | 'doubtful' | 'questionable' | 'probable';

export interface PlayerInjury {
  bodyPart: string;
  severity: InjurySeverity;
  /** Games he still can't play in. */
  weeksOut: number;
  /** Weeks after his return that he plays at reduced ratings. */
  lingering: number;
  /** Weeks after his return with raised re-injury risk. */
  fragile: number;
  season: number;
  week: number;
  /** A career-altering injury: it took ratings for good. */
  career: boolean;
}

/**
 * The week's designation (spec 10.8): out while he has games to miss, doubtful in the last of them,
 * questionable while the injury lingers, probable in its last week. Null when he's healthy.
 */
export function designation(injury: PlayerInjury | null): InjuryDesignation | null {
  if (!injury) return null;
  if (injury.weeksOut >= 2) return 'out';
  if (injury.weeksOut === 1) return 'doubtful';
  if (injury.lingering >= 2) return 'questionable';
  if (injury.lingering === 1) return 'probable';
  return null;
}

/** Whether a designation keeps him out of the game whatever the coach decides. */
export const cannotPlay = (d: InjuryDesignation | null): boolean => d === 'out' || d === 'doubtful';

/** His rating penalty and injury risk if he plays this week. */
export function hurtEffects(injury: PlayerInjury | null): { penalty: number; risk: number } {
  const d = designation(injury);
  const penalty =
    d === 'questionable' ? I.hurtPenalty.questionable : d === 'probable' ? I.hurtPenalty.probable : 0;
  const fragile = injury && injury.weeksOut === 0 && injury.fragile > 0 ? I.fragileRisk : 1;
  return { penalty, risk: fragile * (d === 'questionable' ? I.questionableRisk : 1) };
}

/** A week passes: every injury heals a week, lingering effects and fragility after he's back. */
export function healWeek(league: League): void {
  for (const player of Object.values(league.players)) {
    const injury = player.injury;
    if (!injury) continue;
    if (injury.weeksOut > 0) injury.weeksOut--;
    else {
      if (injury.lingering > 0) injury.lingering--;
      if (injury.fragile > 0) injury.fragile--;
    }
    if (injury.weeksOut === 0 && injury.lingering === 0 && injury.fragile === 0) player.injury = null;
  }
}

/** Takes a career-altering injury's ratings, through the one path every rating change takes. */
function alterCareer(league: League, player: Player, bodyPart: string, rng: Rng): RatingChange | null {
  const keys = (I.careerRatings as Record<string, readonly string[]>)[bodyPart] ?? [];
  const deltas: Partial<Record<RatingKey, number>> = {};
  for (const key of keys) deltas[key as RatingKey] = -rng.int(I.careerLoss[0], I.careerLoss[1]);
  return changeRatings(player, deltas, 'injury', league.date, [{ id: `injury:${bodyPart}`, amount: -1 }]);
}

/**
 * New injuries from a week's games. A player already hurt keeps the longer of the two. Returns the rating
 * changes career-altering injuries caused.
 */
export function applyInjuries(
  league: League,
  events: readonly InjuryEvent[],
  season: number,
  week: number,
  rng: Rng
): RatingChange[] {
  const changes: RatingChange[] = [];
  for (const e of events) {
    const player = league.players[e.playerId];
    if (!player) continue;
    const injury: PlayerInjury = {
      bodyPart: e.bodyPart,
      severity: e.severity,
      weeksOut: e.weeks,
      lingering: I.lingering[e.severity],
      fragile: I.fragile[e.severity],
      season,
      week,
      career: e.severity === 'season' && rng.chance(I.careerChance)
    };
    if (injury.career) {
      const change = alterCareer(league, player, e.bodyPart, rng);
      if (change) changes.push(change);
    }
    const current = player.injury;
    if (!current || injury.weeksOut + injury.lingering >= current.weeksOut + current.lingering)
      player.injury = injury;
  }
  return changes;
}
