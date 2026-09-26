/**
 * Contract negotiation (spec 11.6; D-54). A player answers a team's offer in talks with a yes, a no, or a
 * counter: the salary he'd sign for on the rest of the offer's terms, and what matters most to him. His
 * agent opens above his demand (spec 11.7) and comes down with each offer he turns down, until his patience
 * runs out (sooner for the volatile) and he breaks off talks until the calendar advances. An offer well
 * under his demand is a lowball: it lowers his interest in the team for the league year, and his morale.
 * An offer marked take it or leave it gets a yes or a no, and a no ends the talks until the calendar
 * advances. A team's GM settles in one go, as far under the agent's opening as his negotiation rating
 * reaches: the AI's contract logic, and the user's auto negotiation.
 */
import type { TeamAbbr } from '../../data/team-colors';
import { competence, staffIn } from '../ai/profile';
import type { League } from '../league/types';
import { clampMorale, lowballMorale } from '../locker/room';
import { leagueYear, type GameDate } from '../model/calendar';
import type { Player } from '../model/player';
import { minimumSalary } from '../rules/ruleset';
import { dollars, plural } from '../text';
import { TUNING } from '../tuning';
import { typicalOffer, type Offer } from './build';
import { marketCeiling } from './market';
import {
  askingFrom,
  contextFor,
  demand,
  mattersMost,
  offerWorth,
  reachable,
  salaryFor,
  talksKey,
  type DecisionContext,
  type Term
} from './decision';
import { creditedNextYear } from './resign';

const N = TUNING.contracts.negotiation;

/** A team's talks with a player (spec 11.6), kept through the league year. */
export interface Negotiation {
  year: number;
  /** The calendar step his patience counts in, and the offers he's turned down in it. */
  step: string;
  rounds: number;
  /** Whether he's broken off talks until the calendar advances. */
  closed: boolean;
  /** His last counter in the step. */
  counter?: Offer;
  /** Lowball offers this league year. */
  lowballs: number;
}

/** A player's reply to an offer in talks. */
export type Reply =
  | { kind: 'accept' }
  | { kind: 'counter'; offer: Offer; matters: Term[]; lowball: boolean; teammates?: boolean }
  /** He turned down a take-it-or-leave-it offer, or ran out of patience, and broke off talks. */
  | { kind: 'final' | 'brokeOff'; lowball: boolean; teammates?: boolean }
  /** He'd already broken off talks. */
  | { kind: 'closed' };

/** The calendar step talks count in: a week of the season or of free agency, or a step of the offseason. */
const stepOf = (date: GameDate): string => `${date.season}|${date.phase}|${date.week}`;

/**
 * A team's talks with a player as they stand now: offers he's turned down count for the calendar step, and
 * lowballs for the league year.
 */
export function talks(league: League, team: TeamAbbr, playerId: string): Negotiation {
  const year = leagueYear(league.date);
  const step = stepOf(league.date);
  const known = league.negotiations[talksKey(team, playerId)];
  if (!known || known.year !== year) return { year, step, rounds: 0, closed: false, lowballs: 0 };
  if (known.step === step) return structuredClone(known);
  return { year, step, rounds: 0, closed: false, lowballs: known.lowballs };
}

/** How many offers he turns down in a step before he breaks off talks: fewer for the volatile. */
export const patience = (player: Player): number =>
  Math.round(N.patience[1] - ((N.patience[1] - N.patience[0]) * player.personality.volatility) / 100);

/** A player's minimum salary in talks: now for a free agent, and next league year for an extension. */
export const talksMinimum = (league: League, player: Player, extension = false): number =>
  minimumSalary(league.rules, extension ? creditedNextYear(league, player) : player.experience);

/** How far over his demand his agent opens, as a share of it: further for a harder bargainer (spec 11.6). */
export const openingOf = (player: Player): number =>
  N.opening[0] + ((N.opening[1] - N.opening[0]) * player.dealStyle.agent) / 100;

/**
 * What an offer must be worth to him in talks with a team now: his agent's opening above his demand, less
 * an even share of it for each offer he's turned down in the step. Through free agency's bidding weeks the
 * agent holds at his opening, as the offers compete.
 */
export function askedWorth(league: League, player: Player, team: TeamAbbr, extension = false): number {
  const bidding = !extension && league.date.phase === 'freeAgency';
  const rounds = bidding ? 0 : talks(league, team, player.id).rounds;
  return (
    demand(league, player, extension) * (1 + openingOf(player) * Math.max(0, 1 - rounds / patience(player)))
  );
}

/** What a deal a team's GM settles must be worth to him: as far under the opening as the GM's rating reaches. */
export function settledWorth(league: League, player: Player, team: TeamAbbr, extension = false): number {
  const skill = competence(staffIn(league, team, 'GM'), 'negotiation') / 100;
  return demand(league, player, extension) * (1 + openingOf(player) * (1 - skill));
}

/**
 * A team's deal for `years` years as the AI builds its offers (D-60's bonus, guarantees, and void years by its
 * size), at the least yearly value that's worth `need` to the player by the same model as every offer (spec
 * 11.7): in quote steps, at least `minimum`, and never over his position's ceiling.
 */
export function typicalFor(league: League, ctx: DecisionContext, player: Player, team: TeamAbbr, years: number, need: number, minimum: number): Offer {
  const step = TUNING.market.quoteStep;
  const top = Math.ceil(marketCeiling(league.rules, player.position) / step);
  const at = (steps: number) => typicalOffer(league.rules, years, Math.max(minimum, steps * step), minimum);
  const enough = (steps: number) => offerWorth(league, ctx, player, team, at(steps)).total >= need;
  // As for a counter's salary: `low` steps are never enough, `high` steps are, or are the ceiling.
  let low = Math.floor(minimum / step);
  if (enough(low)) return at(low);
  let high = Math.min(top, low + 1);
  while (high < top && !enough(high)) {
    low = high;
    high = Math.min(top, high * 2);
  }
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (enough(mid)) high = mid;
    else low = mid;
  }
  return at(high);
} // prettier-ignore

/**
 * The deal a team's GM settles for `years` years (spec 11.6; D-66): the AI's usual deal at the least yearly
 * value that's worth what the GM settles for to the player. The AI's re-signings, extensions, and answers to
 * demands, and the user's auto negotiation, all settle this way.
 */
export function settledOffer(league: League, player: Player, team: TeamAbbr, years: number, extension = false): Offer {
  const ctx = contextFor(league);
  const need = reachable(league, ctx, player, team, years, settledWorth(league, player, team, extension));
  return typicalFor(league, ctx, player, team, years, need, talksMinimum(league, player, extension));
} // prettier-ignore

/**
 * What his agent asks a year of a team now for `years` years with no bonus (spec 11.6, 11.8): over the
 * least he'd take, by how hard the agent bargains, and in talks lower with each offer he turns down.
 */
export function askOf(league: League, player: Player, team: TeamAbbr, years = 1, extension = false): number {
  return askingFrom(
    league,
    contextFor(league),
    player,
    team,
    years,
    askedWorth(league, player, team, extension),
    talksMinimum(league, player, extension)
  );
}

/** What a team's front office expects a player to sign for a year: a range of salaries, in quote steps. */
export interface FloorEstimate {
  low: number;
  high: number;
}

/**
 * What a team's front office expects him to sign for a year on an offer's other terms (spec 11.6): a range
 * around the least he'd take, never shown itself, narrower with a better negotiator for a GM. Where the least
 * he'd take falls in it depends on his agent: a hard bargainer's talk puts it near the bottom.
 */
export function floorEstimate(league: League, team: TeamAbbr, player: Player, terms: Omit<Offer, 'salary'>, extension = false): FloorEstimate {
  const ctx = contextFor(league);
  const minimum = talksMinimum(league, player, extension);
  const need = reachable(league, ctx, player, team, terms.years, demand(league, player, extension));
  const floor = salaryFor(league, ctx, player, team, { ...terms, final: false }, need, minimum);
  const skill = competence(staffIn(league, team, 'GM'), 'negotiation') / 100;
  const width = N.estimate[0] + (N.estimate[1] - N.estimate[0]) * skill;
  const within = N.within[1] - ((N.within[1] - N.within[0]) * player.dealStyle.agent) / 100;
  const step = TUNING.market.quoteStep;
  const ceiling = marketCeiling(league.rules, player.position);
  return {
    low: Math.max(minimum, Math.floor((floor * (1 - width * within)) / step) * step),
    high: Math.min(Math.max(ceiling, floor), Math.ceil((floor * (1 + width * (1 - within))) / step) * step)
  };
} // prettier-ignore

/** Contract years a team's GM offers by age: longer for younger players (the AI's contract logic). */
export const termFor = (age: number): number =>
  TUNING.offseason.termByAge.find(([oldest]) => age <= oldest)?.[1] ?? 1;

/** What a team's GM pays a year for `years` years with no bonus: the AI's contract logic (spec 11.6). */
export function settledSalary(league: League, player: Player, team: TeamAbbr, years = 1, extension = false): number {
  const need = settledWorth(league, player, team, extension);
  return askingFrom(league, contextFor(league), player, team, years, need, talksMinimum(league, player, extension));
} // prettier-ignore

/**
 * A player's reply to a team's offer in talks (spec 11.6), kept in the league: an offer he turns down uses
 * his patience, and a lowball his interest in the team and his morale, and his teammates' too when he's a
 * popular leader on the team (spec 10.9). `extension` is for a player under contract with the team.
 */
export function hear(league: League, team: TeamAbbr, player: Player, offer: Offer, extension = false): Reply {
  const now = talks(league, team, player.id);
  if (now.closed) return { kind: 'closed' };
  const ctx = contextFor(league);
  const worth = offerWorth(league, ctx, player, team, offer).total;
  const floor = reachable(league, ctx, player, team, offer.years, demand(league, player, extension));
  const asked = reachable(
    league,
    ctx,
    player,
    team,
    offer.years,
    askedWorth(league, player, team, extension)
  );
  // A final offer is taken at his demand plus his greed's share of the rest of his ask.
  const need = offer.final ? floor + ((asked - floor) * player.personality.greed) / 100 : asked;
  const key = talksKey(team, player.id);
  if (worth >= need) {
    delete league.negotiations[key];
    return { kind: 'accept' };
  }
  const lowball = worth < floor * N.lowball;
  now.rounds++;
  let teammates = false;
  if (lowball) {
    now.lowballs++;
    player.morale = clampMorale(player.morale - N.lowballMorale);
    teammates = lowballMorale(league, team, player);
  }
  const hurt = teammates ? { teammates } : {};
  now.closed = !!offer.final || now.rounds >= patience(player);
  delete now.counter;
  league.negotiations[key] = now;
  if (now.closed) return { kind: offer.final ? 'final' : 'brokeOff', lowball, ...hurt };
  // His counter keeps the rest of the offer, at the salary worth what he asks now that he's turned it down.
  const next = reachable(league, ctx, player, team, offer.years, askedWorth(league, player, team, extension));
  const salary = salaryFor(league, ctx, player, team, offer, next, talksMinimum(league, player, extension));
  const counter = { ...offer, salary };
  now.counter = counter;
  return { kind: 'counter', offer: counter, matters: mattersMost(league, player, counter), lowball, ...hurt };
}

const TERM_WORDS: Record<Term, string> = {
  guarantees: 'guaranteed money',
  bonus: 'more of it up front as a signing bonus',
  longer: 'a longer deal',
  shorter: 'a shorter deal',
  money: 'money each year'
};

/** What matters most to him, in words: "Guaranteed money matters most to him, then a longer deal." */
export function mattersWords(terms: readonly Term[]): string {
  const [first = 'money', ...rest] = terms.map(t => TERM_WORDS[t]);
  return `${first[0]?.toUpperCase()}${first.slice(1)} matters most to him${rest.length ? `, then ${rest.join(', then ')}` : ''}.`;
}

/** A counter's terms in words: "$12,500,000 a year for 3 years". */
export const counterWords = (offer: Offer): string =>
  `${dollars(offer.salary)} a year for ${plural(offer.years, 'year')}`;

/** A reply in words for the user (spec 11.6). */
export function replyWords(reply: Reply): string {
  const teammates =
    'teammates' in reply && reply.teammates ? ' His teammates took it badly, and their morale fell too.' : '';
  const lowball =
    'lowball' in reply && reply.lowball
      ? ` His agent called it a lowball: it cost his interest in your team, and his morale.${teammates}`
      : '';
  switch (reply.kind) {
    case 'accept':
      return 'He accepts.';
    case 'closed':
      return "He's broken off talks with you until you advance.";
    case 'final':
      return `He turned down your final offer, and won't talk to you again until you advance.${lowball}`;
    case 'brokeOff':
      return `He turned it down and broke off talks until you advance.${lowball}`;
    case 'counter':
      return `He turned it down. On the rest of your terms he'd sign for ${counterWords(reply.offer)}. ${mattersWords(reply.matters)}${lowball}`;
  }
}

/** A lowball standing offer as free agency's week ends (spec 11.6, 11.8): it costs his interest and morale. */
export function lowballed(league: League, team: TeamAbbr, player: Player): void {
  const now = talks(league, team, player.id);
  now.lowballs++;
  player.morale = clampMorale(player.morale - N.lowballMorale);
  league.negotiations[talksKey(team, player.id)] = now;
}

/** Talks end with the league year. */
export function resetNegotiations(league: League): void {
  league.negotiations = {};
}
