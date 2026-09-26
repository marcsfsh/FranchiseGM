/**
 * The player decision model (spec 11.7; D-52): how much an offer is worth to a player, what he needs before
 * he signs, and which offer he takes. Worth is counted in his market value, so an offer at his market value
 * from a team that means nothing else to him is worth 1. His personality weighs the rest: competitiveness
 * the chance to win, ego a starting job, loyalty his own team, greed his demand. Everything a team adds
 * beyond money lowers the yearly value it has to pay, so players take less to stay home or chase a ring.
 */
import { TEAM_ABBRS, type TeamAbbr } from '../../data/team-colors';
import { homeStadium } from '../../data/teams';
import { rolesFor } from '../fit/role-rating';
import { leagueFitContext } from '../league/fit';
import type { League } from '../league/types';
import { calendarDay, type GameDate } from '../model/calendar';
import { ageOn, type Player } from '../model/player';
import { POSITION_GROUP } from '../model/positions';
import { minimumSalary, type RuleSet } from '../rules/ruleset';
import { FIT_SLOTS } from '../schemes/slots';
import { buildStandings, winPct } from '../season/standings';
import { PLAYOFF_PHASES } from '../season/state';
import { TUNING } from '../tuning';
import type { Offer } from './build';
import { marketCeiling, marketValue } from './market';

const A = TUNING.contracts.acceptance;
const D = TUNING.contracts.decision;

/** What an offer's worth is made of, each in shares of his market value. */
export interface Worth {
  money: number;
  contender: number;
  role: number;
  home: number;
  loyalty: number;
  fit: number;
  total: number;
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

/** An offer's yearly value: the salary plus the signing bonus spread over the years. */
export const offerValue = (offer: Offer): number =>
  offer.salary + Math.round(offer.signingBonus / Math.max(1, offer.years));

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

/**
 * The model's view for a league as it stands. Contenders and fits hold for the date; the rosters' depth is
 * read again whenever a transaction changes them.
 */
const cached = new WeakMap<League, { date: string; moves: number; ctx: DecisionContext }>();
export function contextFor(league: League): DecisionContext {
  const { season, phase, week } = league.date;
  const date = `${season}|${phase}|${week}`;
  const moves = league.season.transactions.length;
  const known = cached.get(league);
  if (known?.date === date && known.moves === moves) return known.ctx;
  const ctx: DecisionContext =
    known?.date === date ? { ...known.ctx, depth: depthOf(league) } : decisionContext(league);
  cached.set(league, { date, moves, ctx });
  return ctx;
}

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

/** A player's need for security, 0 to 1, by age: older players value years. */
const security = (age: number): number =>
  Math.max(0, Math.min(1, (age - D.securityFrom) / (D.securityFull - D.securityFrom)));

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
  const total = offerValue(offer) * offer.years;
  const money = offerValue(offer) / market + D.perYear * (offer.years - 1) * security(age) + D.guarantee * (total ? offer.signingBonus / total : 0);
  const ring = 1 + Math.max(0, age - D.ringFrom) / 10;
  const contender = (ctx.contenders.get(team) ?? 0) * D.contender * weigh(traits.competitiveness) * ring;
  const role = projectedRole(ctx, player, team) * D.role * weigh(traits.ego);
  const state = homeState(player);
  const home = state !== null && state === homeStadium(team).region ? D.home : 0;
  const loyalty = team === (player.team ?? player.lastTeam) ? (D.loyalty * traits.loyalty) / 100 : 0;
  const fit = D.fit * fitWith(league, ctx, player, team);
  return { money, contender, role, home, loyalty, fit, total: money + contender + role + home + loyalty + fit };
} // prettier-ignore

/** What an offer must be worth to him now (spec 11.7): more for the greedy, less as the market softens. */
export function demand(league: League, player: Player): number {
  const [low, high] = D.demand;
  const base = low + ((high - low) * player.personality.greed) / 100;
  const { phase, week } = league.date;
  const softened = phase === 'freeAgency' ? 1 - D.softening * (week - 1) : 1;
  return base * demandShare(league.date, league.rules) * softened;
}

/** The offer he takes among those he has: the one worth most, once it's worth his demand; null to wait. */
export function chooseOffer<T extends { team: TeamAbbr; offer: Offer }>(league: League, ctx: DecisionContext, player: Player, offers: readonly T[]): T | null {
  const need = demand(league, player);
  let best: { offer: T; worth: number } | null = null;
  for (const o of offers) {
    const worth = offerWorth(league, ctx, player, o.team, o.offer).total;
    if (worth >= need && (!best || worth > best.worth || (worth === best.worth && o.team < best.offer.team))) best = { offer: o, worth };
  }
  return best?.offer ?? null;
} // prettier-ignore

/**
 * The salary a year `team` must offer for `years` years with no bonus before he signs (spec 11.7): his
 * demand less what the team means to him, in quote steps, between his minimum and his position's ceiling.
 */
export function askingFrom(league: League, ctx: DecisionContext, player: Player, team: TeamAbbr, years = 1): number {
  const rules = league.rules;
  const age = ageOn(player.birthDate, calendarDay(league.date));
  const market = marketValue(rules, player.position, player.ovr, age, player.experience);
  const unpaid = offerWorth(league, ctx, player, team, { years, salary: 0, signingBonus: 0 }).total;
  const step = TUNING.market.quoteStep;
  const ask = Math.ceil((market * (demand(league, player) - unpaid)) / step) * step;
  return Math.max(minimumSalary(rules, player.experience), Math.min(marketCeiling(rules, player.position), ask));
} // prettier-ignore
