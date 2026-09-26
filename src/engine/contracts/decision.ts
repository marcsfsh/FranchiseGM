/**
 * The player decision model (spec 11.7; D-52): how much an offer is worth to a player, what he needs before
 * he signs, and which offer he takes. Worth is counted in his market value, so an offer at his market value
 * from a team that means nothing else to him is worth 1. His personality weighs the rest: competitiveness
 * the chance to win, ego a starting job, loyalty his own team, greed his demand. Everything a team adds
 * beyond money lowers the yearly value it has to pay, so players take less to stay home or chase a ring;
 * a team's lowball offers in talks (spec 11.6; D-54) lower his interest in it.
 */
import { TEAM_ABBRS, type TeamAbbr } from '../../data/team-colors';
import { homeStadium } from '../../data/teams';
import { rolesFor } from '../fit/role-rating';
import { leagueFitContext } from '../league/fit';
import type { TransactionKind } from '../league/transactions';
import type { League } from '../league/types';
import { calendarDay, leagueYear, type GameDate } from '../model/calendar';
import { ageOn, type Player } from '../model/player';
import { POSITION_GROUP } from '../model/positions';
import { minimumSalary, type RuleSet } from '../rules/ruleset';
import { FIT_SLOTS } from '../schemes/slots';
import { buildStandings, winPct } from '../season/standings';
import { PLAYOFF_PHASES } from '../season/state';
import { TUNING } from '../tuning';
import type { Offer } from './build';
import { incentiveOdds } from './incentives';
import { marketCeiling, marketValue } from './market';

const A = TUNING.contracts.acceptance;
const D = TUNING.contracts.decision;
const N = TUNING.contracts.negotiation;

/** What an offer's worth is made of, each in shares of his market value. */
export interface Worth {
  money: number;
  contender: number;
  role: number;
  home: number;
  loyalty: number;
  fit: number;
  /** His interest in the team, lowered by its lowball offers this league year (spec 11.6). */
  interest: number;
  total: number;
}

/** The key a team's talks with a player go by in `League.negotiations`. */
export const talksKey = (team: TeamAbbr, playerId: string): string => `${team}|${playerId}`;

/** The lowball offers a team has made a player this league year (spec 11.6). */
export function lowballsFrom(league: League, team: TeamAbbr, playerId: string): number {
  const talks = league.negotiations[talksKey(team, playerId)];
  return talks && talks.year === leagueYear(league.date) ? talks.lowballs : 0;
}

/**
 * What the model reads from the league, gathered once for a set of decisions: each team as a contender from
 * -1 (the weakest) to 1 (the strongest), each team's active overalls by position group (specialists by
 * position), best first, and each player's best fit with each team as it's asked for.
 */
export interface DecisionContext {
  contenders: ReadonlyMap<TeamAbbr, number>;
  depth: ReadonlyMap<string, readonly number[]>;
  fits: Map<string, number>;
}

/** The share of his market value a free agent asks for on a date. */
export function demandShare(date: GameDate, rules: RuleSet): number {
  if (date.phase === 'regularSeason') {
    const t = (Math.min(date.week, rules.season.weeks) - 1) / Math.max(1, rules.season.weeks - 1);
    return A.inSeasonDemand + (A.lateSeasonDemand - A.inSeasonDemand) * t;
  }
  return (PLAYOFF_PHASES as readonly string[]).includes(date.phase) ? A.lateSeasonDemand : A.offseasonDemand;
}

/** A trait's weight: 0.5 at 0, 1.5 at 100. */
const weigh = (trait: number): number => 0.5 + trait / 100;

/** The depth key a player's role is judged by: his position group, or his position for a specialist. */
const unitOf = (p: Player): string =>
  POSITION_GROUP[p.position] === 'ST' ? p.position : POSITION_GROUP[p.position];

/**
 * The model's view of the league (spec 11.7). A contender blends the team's last results and its best 22
 * players' average overall, each ranked across the league.
 */
export function decisionContext(league: League): DecisionContext {
  return { contenders: contendersOf(league), depth: depthOf(league), fits: new Map() };
}

/** Each team's active overalls by position group (specialists by position), best first. */
function depthOf(league: League): Map<string, number[]> {
  const depth = new Map<string, number[]>();
  for (const p of Object.values(league.players))
    if (p.team && p.status === 'active') {
      const key = `${p.team}|${unitOf(p)}`;
      depth.set(key, [...(depth.get(key) ?? []), p.ovr]);
    }
  for (const list of depth.values()) list.sort((a, b) => b - a);
  return depth;
}

/** Each team as a contender, from -1 to 1: its record and its best 22 players, each ranked. */
function contendersOf(league: League): Map<TeamAbbr, number> {
  const best = new Map<TeamAbbr, number[]>();
  for (const p of Object.values(league.players))
    if (p.team && p.status === 'active') best.set(p.team, [...(best.get(p.team) ?? []), p.ovr]);
  const strength = (t: TeamAbbr) => {
    const top = (best.get(t) ?? []).sort((a, b) => b - a).slice(0, 22);
    return top.length ? top.reduce((a, b) => a + b, 0) / top.length : 0;
  };
  const scores = Object.values(league.season.results).filter(g => !g.playoff);
  const records = buildStandings(scores).records;
  const rank = (value: (t: TeamAbbr) => number) => {
    const sorted = [...TEAM_ABBRS].sort((a, b) => value(a) - value(b) || (a < b ? -1 : 1));
    return new Map(TEAM_ABBRS.map(t => [t, sorted.indexOf(t) / (TEAM_ABBRS.length - 1)]));
  };
  // Before any games, records say nothing.
  const results = scores.length
    ? rank(t => winPct(records[t].overall))
    : new Map(TEAM_ABBRS.map(t => [t, 0.5]));
  const rosters = rank(strength);
  return new Map(TEAM_ABBRS.map(t => [t, (results.get(t) ?? 0.5) + (rosters.get(t) ?? 0.5) - 1]));
}

/** Moves that change who's on a roster, and so the depth the model reads. */
const ROSTER_MOVES: ReadonlySet<TransactionKind> = new Set<TransactionKind>([
  'injuredReserve', 'activated', 'reserveReturn', 'signed', 'promoted', 'released', 'claimed', 'practiceSquad', 'drafted', 'heldOut', 'reported'
]); // prettier-ignore

/**
 * The model's view for a league as it stands. Contenders and fits hold for the date; the rosters' depth is
 * read again whenever a move changes a roster (an extension or a tag doesn't).
 */
const cached = new WeakMap<League, { date: string; seen: number; moves: number; ctx: DecisionContext }>();
export function contextFor(league: League): DecisionContext {
  const { season, phase, week } = league.date;
  const date = `${season}|${phase}|${week}`;
  const log = league.season.transactions;
  const known = cached.get(league);
  const same = !!known && known.date === date && known.seen <= log.length;
  let moves = same ? known.moves : 0;
  for (let i = same ? known.seen : 0; i < log.length; i++) if (ROSTER_MOVES.has((log[i] as { kind: TransactionKind }).kind)) moves++;
  if (same && known.moves === moves) {
    known.seen = log.length;
    return known.ctx;
  }
  const ctx: DecisionContext = same ? { ...known.ctx, depth: depthOf(league) } : decisionContext(league);
  cached.set(league, { date, seen: log.length, moves, ctx });
  return ctx;
} // prettier-ignore

/** His role on a team if he joined it: 1 a starter, 0 in the rotation, -1 a backup (spec 11.7). */
export function projectedRole(ctx: DecisionContext, player: Player, team: TeamAbbr): number {
  // Only better players are ahead of him, so on his own team he doesn't count against himself.
  const ahead = (ctx.depth.get(`${team}|${unitOf(player)}`) ?? []).filter(ovr => ovr > player.ovr).length;
  const starters = D.starters[POSITION_GROUP[player.position]];
  return ahead < starters ? 1 : ahead <= starters ? 0 : -1;
}

/** His best role's fit with a team, from -1 to 1 of the fit cap. */
function fitWith(league: League, ctx: DecisionContext, player: Player, team: TeamAbbr): number {
  const key = `${team}|${player.id}`;
  let fit = ctx.fits.get(key);
  if (fit === undefined) {
    const best = rolesFor(player, leagueFitContext(league, team), FIT_SLOTS)[0];
    fit = best ? Math.max(-1, Math.min(1, best.fit / Math.max(1, league.settings.fitCap))) : 0;
    ctx.fits.set(key, fit);
  }
  return fit;
}

/** A player's need for security, 0 to 1, by age: older players value guarantees. */
const security = (age: number): number =>
  Math.max(0, Math.min(1, (age - D.securityFrom) / (D.securityFull - D.securityFrom)));

/** His injury risk as he weighs a deal (spec 11.7), 0 durable to 1 fragile: his injury rating, more while hurt. */
export function proneness(player: Player): number {
  const { durable, fragile, hurtNow } = D.injury;
  const rated = Math.max(0, Math.min(1, (durable - player.ratings.inj) / (durable - fragile)));
  return Math.min(1, rated + ((player.injury?.weeksOut ?? 0) > 0 ? hurtNow : 0));
}

/**
 * The deal length he wants (spec 11.7): a short one to bet on himself while he's young and still rising,
 * every year he can get once he's older or fragile, and a long one in his prime.
 */
export function preferredYears(age: number, player: Player): number {
  const L = D.length;
  if (age >= L.securityFrom || proneness(player) >= L.fragileAt) return A.maxYears;
  if (age <= L.risingThrough && player.potential - player.ovr >= L.risingBy) return L.rising;
  return L.prime;
}

/** The share of a per-game roster bonus he counts on earning (spec 11.7): by his role, less for injury risk. */
export function activeShare(role: number, prone: number): number {
  const base = role > 0 ? D.active.starter : role < 0 ? D.active.backup : D.active.rotation;
  return base * (1 - D.active.injury * prone);
}

/** What a guaranteed dollar is worth to him over a dollar that isn't (spec 11.7): more when older or fragile. */
const guaranteePremium = (age: number, prone: number): number =>
  D.guarantee * (1 + D.guaranteeAge * security(age) + D.guaranteeInjury * prone);

/** What a signing bonus dollar is worth to him over a salary dollar, by his taste for money up front. */
const upFrontPremium = (player: Player): number => (D.upFront * player.dealStyle.upFront) / 100;

/**
 * An offer's money to him, in shares of his market value (spec 11.7; D-64): its yearly value (the salary,
 * the bonus spread over the years, the per-game bonus he expects to earn at `role`, and an incentive at the
 * odds he gives himself), guaranteed and bonus dollars at their premiums, less what its length misses by.
 */
function moneyWorth(league: League, player: Player, offer: Offer, age: number, market: number, role: number): number {
  const prone = proneness(player);
  const years = Math.max(1, offer.years);
  const bonus = offer.signingBonus / years;
  const perGame = (offer.perGameBonus ?? 0) * activeShare(role, prone);
  const incentive = offer.incentive ? offer.incentive.amount * incentiveOdds(league, player, offer.incentive) : 0;
  const guaranteed = bonus + (Math.min(years, offer.guaranteedYears ?? 0) * offer.salary) / years;
  const premiums = guaranteed * guaranteePremium(age, prone) + bonus * upFrontPremium(player);
  const length = -D.length.miss * Math.abs(offer.years - preferredYears(age, player));
  return (offer.salary + bonus + perGame + incentive + premiums) / market + length;
} // prettier-ignore

/** His state or province, from his hometown ("Austin, TX"); null abroad. */
function homeState(p: Player): string | null {
  const parts = p.hometown.split(', ');
  return parts.length === 2 ? (parts[1] ?? null) : null;
}

/** How much an offer from `team` is worth to him (spec 11.7), in shares of his market value. */
export function offerWorth(league: League, ctx: DecisionContext, player: Player, team: TeamAbbr, offer: Offer): Worth {
  const age = ageOn(player.birthDate, calendarDay(league.date));
  const market = marketValue(league.rules, player.position, player.ovr, age, player.experience);
  const traits = player.personality;
  const projected = projectedRole(ctx, player, team);
  const money = moneyWorth(league, player, offer, age, market, projected);
  const ring = 1 + Math.max(0, age - D.ringFrom) * D.ringPerYear;
  const contender = (ctx.contenders.get(team) ?? 0) * D.contender * weigh(traits.competitiveness) * ring;
  const role = projected * D.role * weigh(traits.ego);
  const state = homeState(player);
  const home = state !== null && state === homeStadium(team).region ? D.home : 0;
  const loyalty = team === (player.team ?? player.lastTeam) ? (D.loyalty * traits.loyalty) / 100 : 0;
  const fit = D.fit * fitWith(league, ctx, player, team);
  const interest = -N.lowballInterest * lowballsFrom(league, team, player.id);
  return { money, contender, role, home, loyalty, fit, interest, total: money + contender + role + home + loyalty + fit + interest };
} // prettier-ignore

/**
 * What an offer must be worth to him now (spec 11.7): more for the greedy, less as the market softens. A
 * player under contract talking about an extension isn't on the market, so he asks the offseason's share.
 */
export function demand(league: League, player: Player, extension = false): number {
  const [low, high] = D.demand;
  const base = low + ((high - low) * player.personality.greed) / 100;
  if (extension) return base * A.offseasonDemand;
  const { phase, week } = league.date;
  const softened = phase === 'freeAgency' ? 1 - D.softening * (week - 1) : 1;
  return base * demandShare(league.date, league.rules) * softened;
}

/**
 * The worth an offer from `team` for `years` years must reach to meet `need`: a record deal at his
 * position (its ceiling a year, with no bonus) always does, so what he asks never tops the ceiling.
 */
export function reachable(league: League, ctx: DecisionContext, player: Player, team: TeamAbbr, years: number, need: number): number {
  const record = { years, salary: marketCeiling(league.rules, player.position), signingBonus: 0 };
  return Math.min(need, offerWorth(league, ctx, player, team, record).total);
} // prettier-ignore

/**
 * The offer he takes among those he has: the one worth most, once it's worth `need` (his demand unless
 * given); null to wait.
 */
export function chooseOffer<T extends { team: TeamAbbr; offer: Offer }>(league: League, ctx: DecisionContext, player: Player, offers: readonly T[], need = demand(league, player)): T | null {
  let best: { offer: T; worth: number } | null = null;
  for (const o of offers) {
    const worth = offerWorth(league, ctx, player, o.team, o.offer).total;
    if (worth < reachable(league, ctx, player, o.team, o.offer.years, need)) continue;
    if (!best || worth > best.worth || (worth === best.worth && o.team < best.offer.team)) best = { offer: o, worth };
  }
  return best?.offer ?? null;
} // prettier-ignore

/**
 * The salary a year `team` must offer for `years` years with no bonus before he signs (spec 11.7): an
 * offer worth `need` (his demand unless given) less what the team means to him, in quote steps, between
 * `minimum` (his minimum unless given) and his position's ceiling.
 */
export function askingFrom(league: League, ctx: DecisionContext, player: Player, team: TeamAbbr, years = 1, need = demand(league, player), minimum = minimumSalary(league.rules, player.experience)): number {
  const rules = league.rules;
  const age = ageOn(player.birthDate, calendarDay(league.date));
  const market = marketValue(rules, player.position, player.ovr, age, player.experience);
  const unpaid = offerWorth(league, ctx, player, team, { years, salary: 0, signingBonus: 0 }).total;
  const step = TUNING.market.quoteStep;
  const ask = Math.ceil((market * (need - unpaid)) / step) * step;
  return Math.max(minimum, Math.min(marketCeiling(rules, player.position), ask));
} // prettier-ignore

/**
 * The least salary a year, in quote steps and at least `minimum`, that makes an offer on these terms worth
 * `need` to him from `team` (spec 11.6): for a counter that keeps the rest of an offer.
 */
export function salaryFor(league: League, ctx: DecisionContext, player: Player, team: TeamAbbr, terms: Omit<Offer, 'salary'>, need: number, minimum: number): number {
  const step = TUNING.market.quoteStep;
  const at = (steps: number) => Math.max(minimum, steps * step);
  const enough = (steps: number) => offerWorth(league, ctx, player, team, { ...terms, salary: at(steps) }).total >= need;
  // Salary adds to worth faster than it thins the guaranteed share, so the least enough salary is found by
  // doubling past it and halving back: `low` steps are never enough, `high` steps always are.
  let low = Math.floor(minimum / step);
  if (enough(low)) return minimum;
  let high = low + 1;
  while (!enough(high)) {
    low = high;
    high *= 2;
  }
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (enough(mid)) high = mid;
    else low = mid;
  }
  return at(high);
} // prettier-ignore

/** The terms a counter can name as mattering most to a player (spec 11.6). */
export type Term = 'guarantees' | 'bonus' | 'longer' | 'shorter' | 'money';

/**
 * What matters most to him in an offer's terms (spec 11.6), most first: the terms that could add enough to
 * the offer's worth to him (guaranteeing the rest of the money, taking more of it up front as a bonus, or the
 * length he wants), else money each year.
 */
export function mattersMost(league: League, player: Player, offer: Offer): Term[] {
  const age = ageOn(player.birthDate, calendarDay(league.date));
  const market = marketValue(league.rules, player.position, player.ovr, age, player.experience);
  const years = Math.max(1, offer.years);
  const guaranteed = offer.signingBonus + Math.min(years, offer.guaranteedYears ?? 0) * offer.salary;
  const salaries = offer.salary * years;
  const preferred = preferredYears(age, player);
  const room: [Term, number][] = [
    ['guarantees', (guaranteePremium(age, proneness(player)) * (salaries + offer.signingBonus - guaranteed)) / (market * years)],
    ['bonus', (upFrontPremium(player) * salaries) / (market * years)],
    [preferred > years ? 'longer' : 'shorter', D.length.miss * Math.abs(years - preferred)]
  ];
  const terms = room.filter(([, worth]) => worth >= N.matters).sort((a, b) => b[1] - a[1]);
  return terms.length ? terms.map(([term]) => term) : ['money'];
} // prettier-ignore
