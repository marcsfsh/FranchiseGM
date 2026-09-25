/**
 * Whether a free agent takes an offer (M8's simple model; the full player decision model is M12's): he asks
 * for a share of his market value that falls as the regular season goes on, and signs when the offer's
 * yearly value reaches it.
 */
import type { League } from '../league/types';
import { calendarDay, type GameDate } from '../model/calendar';
import { ageOn, type Player } from '../model/player';
import { minimumSalary, type RuleSet } from '../rules/ruleset';
import { PLAYOFF_PHASES } from '../season/state';
import { dollars } from '../text';
import { TUNING } from '../tuning';
import type { Offer } from './build';
import { marketValue } from './market';

const A = TUNING.contracts.acceptance;

/** The share of his market value a free agent asks for on a date. */
export function demandShare(date: GameDate, rules: RuleSet): number {
  if (date.phase === 'regularSeason') {
    const t = (Math.min(date.week, rules.season.weeks) - 1) / Math.max(1, rules.season.weeks - 1);
    return A.inSeasonDemand + (A.lateSeasonDemand - A.inSeasonDemand) * t;
  }
  return (PLAYOFF_PHASES as readonly string[]).includes(date.phase) ? A.lateSeasonDemand : A.offseasonDemand;
}

/** What a free agent asks for per year now, in quote steps, never under his minimum. */
export function askingSalary(league: League, player: Player): number {
  const rules = league.rules;
  const age = ageOn(player.birthDate, calendarDay(league.date));
  const value = marketValue(rules, player.position, player.ovr, age, player.experience);
  const step = TUNING.market.quoteStep;
  const ask = Math.round((value * demandShare(league.date, rules)) / step) * step;
  return Math.max(minimumSalary(rules, player.experience), ask);
}

/** An offer's yearly value: the salary plus the signing bonus spread over the years. */
export const offerValue = (offer: Offer): number =>
  offer.salary + Math.round(offer.signingBonus / Math.max(1, offer.years));

/** Why a free agent turns an offer down, or null if he takes it. */
export function offerProblem(league: League, player: Player, offer: Offer): string | null {
  const minimum = minimumSalary(league.rules, player.experience);
  if (!Number.isInteger(offer.years) || offer.years < 1 || offer.years > A.maxYears)
    return `Offer 1 to ${A.maxYears} years.`;
  if (!Number.isInteger(offer.salary) || offer.salary < minimum)
    return `His minimum salary is ${dollars(minimum)} a year.`;
  if (!Number.isInteger(offer.signingBonus) || offer.signingBonus < 0)
    return 'The signing bonus must be a whole-dollar amount, zero or more.';
  const ask = askingSalary(league, player);
  return offerValue(offer) >= ask ? null : `He wants at least ${dollars(ask)} a year.`;
}
