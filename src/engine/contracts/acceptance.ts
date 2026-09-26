/**
 * Whether a free agent takes an offer. He asks for a share of his market value that falls as the regular
 * season goes on; from a team, the player decision model (spec 11.7, D-52) weighs what else it offers him, so
 * his asking price and his answer are that team's.
 */
import type { TeamAbbr } from '../../data/team-colors';
import type { League } from '../league/types';
import { calendarDay } from '../model/calendar';
import { ageOn, type Player } from '../model/player';
import { minimumSalary } from '../rules/ruleset';
import { dollars } from '../text';
import { TUNING } from '../tuning';
import type { Offer } from './build';
import { askingFrom, contextFor, demand, demandShare, offerWorth } from './decision';
import { marketValue } from './market';

const A = TUNING.contracts.acceptance;

/**
 * What a free agent asks for per year now, in quote steps, never under his minimum; from `team`, what he'd
 * sign with it for (spec 11.7).
 */
export function askingSalary(league: League, player: Player, team?: TeamAbbr): number {
  if (team) return askingFrom(league, contextFor(league), player, team);
  const rules = league.rules;
  const age = ageOn(player.birthDate, calendarDay(league.date));
  const value = marketValue(rules, player.position, player.ovr, age, player.experience);
  const step = TUNING.market.quoteStep;
  const ask = Math.round((value * demandShare(league.date, rules)) / step) * step;
  return Math.max(minimumSalary(rules, player.experience), ask);
}

/** Why a free agent turns down an offer from `team`, or null if he takes it (spec 11.7). */
export function offerProblem(league: League, player: Player, offer: Offer, team: TeamAbbr): string | null {
  const minimum = minimumSalary(league.rules, player.experience);
  if (!Number.isInteger(offer.years) || offer.years < 1 || offer.years > A.maxYears)
    return `Offer 1 to ${A.maxYears} years.`;
  if (!Number.isInteger(offer.salary) || offer.salary < minimum)
    return `His minimum salary is ${dollars(minimum)} a year.`;
  if (!Number.isInteger(offer.signingBonus) || offer.signingBonus < 0)
    return 'The signing bonus must be a whole-dollar amount, zero or more.';
  const ctx = contextFor(league);
  if (offerWorth(league, ctx, player, team, offer).total >= demand(league, player)) return null;
  return `He wants at least ${dollars(askingFrom(league, ctx, player, team, offer.years))} a year from you.`;
}
