/**
 * What a deal is worth to a team (D-38): the player's overall projected a season at a time from the age
 * curves (spec 10.5), each season priced by the market at that overall as a player in his prime, since the
 * projection carries his decline already. The AI's re-signing and its free agency bids weigh it against the
 * deal's cost, so age lowers what a team pays through the decline it expects, with no cutoff.
 */
import type { League } from '../league/types';
import type { Player } from '../model/player';
import { projectedOverall } from '../progression/develop';
import type { Offer } from './build';
import { marketValue, primeAge } from './market';

/** His value over the next `years` seasons: each season's projected overall, priced by the market. */
export function dealValue(league: League, player: Player, years: number): number {
  const prime = primeAge(player.position);
  return projectedOverall(league, player, years).reduce(
    (sum, ovr, i) => sum + marketValue(league.rules, player.position, ovr, prime, player.experience + i + 1),
    0
  );
}

/** A deal's cost to the team over its years: salary and per-game bonuses each year, and the signing bonus. */
export const dealCost = (offer: Offer): number =>
  (offer.salary + (offer.perGameBonus ?? 0)) * offer.years + offer.signingBonus;

/** Whether a deal is worth its cost to a team (D-38). */
export const worthIt = (league: League, player: Player, offer: Offer): boolean =>
  dealValue(league, player, offer.years) >= dealCost(offer);
