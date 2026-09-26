/**
 * What a deal is worth to a team (D-38): the player's overall projected a season at a time from the age
 * curves (spec 10.5), each season priced by the market at that overall as a player in his prime, since the
 * projection carries his decline already, but never below the market's own price for his overall now at his
 * age that season, and at the cap that season is expected to have, since the market grows with it (D-60).
 * The AI's re-signing and its free agency bids weigh it against the deal's cost, so age lowers what a team
 * pays through the decline it expects, with no cutoff, and never more than the market does.
 */
import { expectedNextCap } from '../cap/growth';
import type { League } from '../league/types';
import { calendarDay } from '../model/calendar';
import { ageOn, type Player } from '../model/player';
import { projectedOverall } from '../progression/develop';
import { TUNING } from '../tuning';
import type { Offer } from './build';
import { marketValue, primeAge } from './market';

/** His value over the next `years` seasons: each season's projected overall, priced by that season's market. */
export function dealValue(league: League, player: Player, years: number): number {
  const prime = primeAge(player.position);
  const { rules } = league;
  const age = ageOn(player.birthDate, calendarDay(league.date));
  const growth = expectedNextCap(rules) / rules.cap.amount;
  return projectedOverall(league, player, years).reduce((sum, ovr, i) => {
    const then = { ...rules, cap: { ...rules.cap, amount: rules.cap.amount * growth ** i } };
    const credited = player.experience + i + 1;
    const projected = marketValue(then, player.position, ovr, prime, credited);
    return sum + Math.max(projected, marketValue(then, player.position, player.ovr, age + i, credited));
  }, 0);
}

/** A deal's cost to the team over its years: salary and per-game bonuses each year, and the signing bonus. */
export const dealCost = (offer: Offer): number =>
  (offer.salary + (offer.perGameBonus ?? 0)) * offer.years + offer.signingBonus;

/**
 * How much more than its value of a deal a team pays for its `room` under the cap (D-60): 1, rising with the
 * room past the tuned share, to the most.
 */
export function roomPremium(league: League, room: number): number {
  const R = TUNING.market.roomPremium;
  return Math.min(R.most, 1 + R.perShare * Math.max(0, room / league.rules.cap.amount - R.from));
}

/** Whether a deal is worth its cost to a team (D-38), its value raised by the team's `premium` for its room. */
export const worthIt = (league: League, player: Player, offer: Offer, premium = 1): boolean =>
  dealValue(league, player, offer.years) * premium >= dealCost(offer);
