/**
 * Whether a free agent takes an offer at the market: as the AI signs him, and through free agency's
 * bidding. He asks for a share of his market value that falls as the regular season goes on; from a team,
 * the player decision model (spec 11.7, D-52) weighs what else it offers him, so his asking price and his
 * answer are that team's. In talks with the user (spec 11.6) his agent asks more: see negotiation.ts.
 */
import type { TeamAbbr } from '../../data/team-colors';
import type { League } from '../league/types';
import { calendarDay } from '../model/calendar';
import { ageOn, type Player } from '../model/player';
import { minimumSalary } from '../rules/ruleset';
import { TUNING } from '../tuning';
import { termsProblem, type Offer } from './build';
import { contextFor, demand, demandShare, offerWorth, reachable } from './decision';
import { marketValue } from './market';
import { settledSalary } from './negotiation';

/**
 * What a free agent asks for per year now, in quote steps, never under his minimum; from `team`, what its
 * GM would sign him for (spec 11.6, 11.7).
 */
export function askingSalary(league: League, player: Player, team?: TeamAbbr): number {
  if (team) return settledSalary(league, player, team);
  const rules = league.rules;
  const age = ageOn(player.birthDate, calendarDay(league.date));
  const value = marketValue(rules, player.position, player.ovr, age, player.experience);
  const step = TUNING.market.quoteStep;
  const ask = Math.round((value * demandShare(league.date, rules)) / step) * step;
  return Math.max(minimumSalary(rules, player.experience), ask);
}

/**
 * Why a free agent turns down an offer from `team` at the market, or null if he takes it (spec 11.7). The
 * least he'd take stays his own (spec 11.6): a no doesn't name it.
 */
export function offerProblem(league: League, player: Player, offer: Offer, team: TeamAbbr): string | null {
  const terms = termsProblem(league.rules, offer, minimumSalary(league.rules, player.experience));
  if (terms) return terms;
  const ctx = contextFor(league);
  const need = reachable(league, ctx, player, team, offer.years, demand(league, player));
  if (offerWorth(league, ctx, player, team, offer).total >= need) return null;
  return "He turns it down: it isn't enough for him.";
}
