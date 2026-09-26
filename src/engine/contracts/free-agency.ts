/**
 * Free agency weeks and bidding (spec 11.8; D-53). Through the four weeks of free agency, teams' offers to
 * free agents stand until the player answers or the team takes the offer back. As each week opens the AI
 * teams make their offers, by need and value within the cap room they keep; as it ends the players decide,
 * the most valuable first: each takes the offer worth most to him once one is worth his demand (D-52), or
 * waits a week, when he asks for less. An offer marked take it or leave it falls away if he waits, and a
 * lowball offer costs his interest in the team and his morale (spec 11.6). After the fourth week the bidding
 * closes, and teams negotiate with free agents one on one.
 */
import { TEAM_ABBRS, type TeamAbbr } from '../../data/team-colors';
import { NEED_GROUP, TARGET } from '../ai/decisions/roster-moves';
import { capSheet } from '../cap/sheet';
import { rookieReserve } from '../generate/rookies';
import { freeAgents } from '../league/transactions';
import type { League } from '../league/types';
import { calendarDay, type GameDate } from '../model/calendar';
import { ageOn, fullName, type Player } from '../model/player';
import type { Rng } from '../rng';
import { minimumSalary } from '../rules/ruleset';
import { makeMove } from '../roster/moves';
import { cannotPlay, designation } from '../season/injuries';
import { dollars, plural } from '../text';
import { TUNING } from '../tuning';
import { offerAav, termsProblem, typicalOffer, type Offer } from './build';
import { likelyToEarn } from './incentives';
import { chooseOffer, contextFor, demand, offerWorth, reachable, salaryFor } from './decision';
import { marketValue } from './market';
import { askedWorth, floorEstimate, lowballed, termFor, typicalFor } from './negotiation';
import { dealValue, roomPremium } from './value';

const F = TUNING.freeAgency;
const N = TUNING.contracts.negotiation;

/** A team's standing offer to a free agent. */
export interface FreeAgentOffer {
  team: TeamAbbr;
  offer: Offer;
  made: GameDate;
}

/** A free agent who took an offer as a week ended. */
export interface FreeAgentSigning {
  player: Player;
  team: TeamAbbr;
  offer: Offer;
}

/** Free agency's weeks of bidding (spec 11.8). */
export const FREE_AGENCY_WEEKS = 4;

/** Whether teams bid on free agents now: through free agency's four weeks. */
export const biddingOpen = (league: League): boolean => league.date.phase === 'freeAgency';

/**
 * An offer's charge on the cap in its first league year: its salary, the bonus's first share (void years
 * spread it further), the per-game bonus as though he's active for every game, and an incentive he's
 * already reached the mark of, as likely to be earned.
 */
export const firstYearCharge = (league: League, offer: Offer, player?: Player): number =>
  offer.salary +
  Math.round(offer.signingBonus / Math.min(offer.years + (offer.voidYears ?? 0), league.rules.pay.prorationYearsMax)) +
  (offer.perGameBonus ?? 0) +
  (player && offer.incentive && likelyToEarn(league, player, offer.incentive) ? offer.incentive.amount : 0); // prettier-ignore

/** The offers a team has standing, and what they'd put on its cap and roster if every one were taken. */
export function pendingFor(league: League, team: TeamAbbr): { players: string[]; charge: number } {
  const players: string[] = [];
  let charge = 0;
  for (const [id, offers] of Object.entries(league.faOffers))
    for (const o of offers)
      if (o.team === team) {
        players.push(id);
        charge += firstYearCharge(league, o.offer, league.players[id]);
      }
  return { players, charge };
}

/** The offers standing for a player. */
export const offersFor = (league: League, playerId: string): readonly FreeAgentOffer[] =>
  league.faOffers[playerId] ?? [];

/**
 * Why a team can't make this offer now, or null: bidding must be open, the terms valid, and the offer must
 * fit, with the team's other standing offers, under its cap and its offseason roster limit.
 */
export function offerProblem(league: League, team: TeamAbbr, playerId: string, offer: Offer): string | null {
  const player = league.players[playerId];
  if (!player || player.status !== 'freeAgent') return "He isn't a free agent.";
  if (!biddingOpen(league)) return 'Offers wait for free agency; after it, free agents sign when an offer is good enough.';
  const terms = termsProblem(league.rules, offer, minimumSalary(league.rules, player.experience));
  if (terms) return terms;
  const pending = pendingFor(league, team);
  const other = offersFor(league, playerId).find(o => o.team === team);
  const charge = pending.charge - (other ? firstYearCharge(league, other.offer, player) : 0) + firstYearCharge(league, offer, player);
  const space = capSheet(league, team).space;
  if (charge > space) return `Your standing offers would add ${dollars(charge)} to your cap if all were taken, more than your ${dollars(Math.max(0, space))} of space.`;
  const rostered = Object.values(league.players).filter(p => p.team === team && p.status === 'active').length;
  const offered = pending.players.length + (other ? 0 : 1);
  if (rostered + offered > league.rules.roster.offseason) return `Your roster and your standing offers would pass the offseason limit of ${league.rules.roster.offseason}.`;
  return null;
} // prettier-ignore

/** Makes or changes a team's offer to a free agent. Returns why not, or null. */
export function makeOffer(league: League, team: TeamAbbr, playerId: string, offer: Offer): string | null {
  const problem = offerProblem(league, team, playerId, offer);
  if (problem) return problem;
  const others = offersFor(league, playerId).filter(o => o.team !== team);
  league.faOffers[playerId] = [...others, { team, offer: { ...offer }, made: { ...league.date } }];
  return null;
}

/** Takes a team's offer back. */
export function withdrawOffer(league: League, team: TeamAbbr, playerId: string): void {
  const left = offersFor(league, playerId).filter(o => o.team !== team);
  if (left.length) league.faOffers[playerId] = left;
  else delete league.faOffers[playerId];
}

/**
 * A team's offers as a week of free agency opens (spec 11.8): the free agents who'd fill a hole or start
 * over its weakest starter at their group, most wanted first, each at what he'd ask of this team plus a
 * premium for the ones it wants most, but never more a year than his projected value over the deal (D-38),
 * while its standing offers fit the cap room it keeps for its draft class and the season. Returns the
 * players offered.
 */
export function teamBids(league: League, team: TeamAbbr, order: readonly TeamAbbr[]): Player[] {
  const ctx = contextFor(league);
  const today = calendarDay(league.date);
  raiseBids(league, team, order);
  const mine = Object.values(league.players).filter(p => p.team === team && p.status === 'active');
  const count = new Map<string, number>();
  const weakest = new Map<string, number>();
  for (const p of mine) {
    const group = NEED_GROUP[p.position];
    count.set(group, (count.get(group) ?? 0) + 1);
    if (!cannotPlay(designation(p.injury))) weakest.set(group, Math.min(weakest.get(group) ?? Infinity, p.ovr));
  }
  const budget = capSheet(league, team).space - rookieReserve(league, team, order) - F.buffer * league.rules.cap.amount - pendingFor(league, team).charge;
  // A team with room pays more and signs depth (D-60, D-65): its value of each deal, the most it raises an
  // offer to, and how far under its weakest starter it still wants a player rise with it.
  const rich = roomPremium(league, budget);
  const depth = (rich - 1) * TUNING.market.roomPremium.depthPoints;
  const wants = freeAgents(league)
    .filter(p => !offersFor(league, p.id).some(o => o.team === team) && !cannotPlay(designation(p.injury)))
    .map(p => {
      const group = NEED_GROUP[p.position];
      const short = Math.max(0, (TARGET.get(group) ?? 0) - (count.get(group) ?? 0));
      const upgrade = p.ovr - (weakest.get(group) ?? 0) - F.upgradeBy + depth;
      return { p, want: short * F.needPoints + upgrade, short };
    })
    .filter(w => w.short > 0 || w.want > 0)
    .sort((a, b) => b.want - a.want || b.p.ovr - a.p.ovr || (a.p.id < b.p.id ? -1 : 1));
  let left = budget;
  const offered: Player[] = [];
  for (const { p, want } of wants) {
    if (offered.length >= F.offersPerWeek || left <= 0) break;
    const years = termFor(ageOn(p.birthDate, today));
    // The least he'd take on the team's usual deal, and more for the ones it wants most (D-65).
    const minimum = minimumSalary(league.rules, p.experience);
    const ask = offerAav(typicalFor(league, ctx, p, team, years, reachable(league, ctx, p, team, years, demand(league, p)), minimum));
    const premium = Math.min(F.premium, Math.max(0, want) / F.premiumAt * F.premium);
    const step = TUNING.market.quoteStep;
    const worth = Math.floor((dealValue(league, p, years) * rich) / years / step) * step;
    const salary = Math.min(worth, Math.round((ask * (1 + premium)) / step) * step);
    // He asks more than he's worth to the team over the deal.
    if (salary < ask) continue;
    const offer = typicalOffer(league.rules, years, salary, minimum);
    if (firstYearCharge(league, offer) > left) continue;
    if (makeOffer(league, team, p.id, offer) === null) {
      left -= firstYearCharge(league, offer);
      offered.push(p);
    }
  }
  return offered;
} // prettier-ignore

/**
 * A team's standing offers raised as a week of free agency opens (spec 11.8; D-65): each free agent who
 * passed on its offer gets `raise` more a year, built as the AI builds its deals, while he's still worth
 * that to the team over the deal (D-38) and its offers fit the room it keeps.
 */
export function raiseBids(league: League, team: TeamAbbr, order: readonly TeamAbbr[]): number {
  const step = TUNING.market.quoteStep;
  let left = capSheet(league, team).space - rookieReserve(league, team, order) - F.buffer * league.rules.cap.amount - pendingFor(league, team).charge; // prettier-ignore
  const rich = roomPremium(league, left);
  let raised = 0;
  for (const [id, offers] of Object.entries(league.faOffers)) {
    const player = league.players[id];
    const mine = offers.find(o => o.team === team);
    if (!player || !mine || player.status !== 'freeAgent') continue;
    const years = mine.offer.years;
    const worth = Math.floor((dealValue(league, player, years) * rich) / years / step) * step;
    const aav = offerAav(mine.offer);
    const next = Math.min(worth, Math.round((aav * (1 + F.raise)) / step) * step);
    if (next <= aav) continue;
    const offer = typicalOffer(league.rules, years, next, minimumSalary(league.rules, player.experience));
    const more = firstYearCharge(league, offer, player) - firstYearCharge(league, mine.offer, player);
    if (more > left || makeOffer(league, team, id, offer) !== null) continue;
    left -= more;
    raised++;
  }
  return raised;
}

/** Every AI team's offers as a week of free agency opens, in draft order. */
export function aiBids(league: League, teams: readonly TeamAbbr[], order: readonly TeamAbbr[]): number {
  let total = 0;
  for (const team of order) if (teams.includes(team)) total += teamBids(league, team, order).length;
  return total;
}

/**
 * How far over his demand a free agent holds out as a week of free agency ends (spec 11.8; D-65): up to
 * `hope` of it by his greed as the market opens, falling to none by its last week.
 */
export function hopeOf(league: League, player: Player): number {
  const left = Math.max(0, FREE_AGENCY_WEEKS - league.date.week) / (FREE_AGENCY_WEEKS - 1);
  return F.hope * (0.5 + player.personality.greed / 100) * left;
}

/**
 * The week's decisions as it ends (spec 11.8): each free agent with offers, the most valuable first, takes
 * the one worth most to him once one is worth his demand and what he still hopes for over it, if the team can
 * still sign him; the rest wait for better offers or for any. One who waits lets a take-it-or-leave-it offer
 * fall away, and holds a lowball against its team (spec 11.6).
 */
export function decideWeek(league: League, rng: Rng): FreeAgentSigning[] {
  const today = calendarDay(league.date);
  const value = (p: Player) => marketValue(league.rules, p.position, p.ovr, ageOn(p.birthDate, today), p.experience);
  const players = Object.keys(league.faOffers)
    .map(id => league.players[id])
    .filter((p): p is Player => !!p && p.status === 'freeAgent')
    .sort((a, b) => value(b) - value(a) || (a.id < b.id ? -1 : 1));
  const signings: FreeAgentSigning[] = [];
  for (const player of players) {
    let offers = [...offersFor(league, player.id)];
    const need = demand(league, player) * (1 + hopeOf(league, player));
    while (offers.length) {
      const ctx = contextFor(league);
      const choice = chooseOffer(league, ctx, player, offers, need);
      if (!choice) break;
      const done = makeMove(league, { kind: 'sign', team: choice.team, playerId: player.id, offer: choice.offer, reason: 'in free agency' }, rng);
      if (done.ok) {
        signings.push({ player, team: choice.team, offer: choice.offer });
        delete league.faOffers[player.id];
        break;
      }
      // The team can't sign him now, so its offer falls away.
      offers = offers.filter(o => o !== choice);
      league.faOffers[player.id] = offers;
    }
    if (player.status !== 'freeAgent') continue;
    offers = passOn(league, player, offers);
    if (offers.length) league.faOffers[player.id] = offers;
    else delete league.faOffers[player.id];
  }
  return signings;
} // prettier-ignore

/** The offers a waiting free agent keeps: final offers fall away, and lowballs cost their teams (spec 11.6). */
function passOn(league: League, player: Player, offers: FreeAgentOffer[]): FreeAgentOffer[] {
  const ctx = contextFor(league);
  const need = demand(league, player);
  for (const o of offers)
    if (offerWorth(league, ctx, player, o.team, o.offer).total < reachable(league, ctx, player, o.team, o.offer.years, need) * N.lowball)
      lowballed(league, o.team, player);
  return offers.filter(o => !o.offer.final);
} // prettier-ignore

/** The bidding closes after free agency's last week: the offers left fall away. */
export function closeBidding(league: League): void {
  league.faOffers = {};
}

/**
 * How a team's front office reads its offer to a free agent, in words, for the user's offer dialog (spec
 * 11.6, 11.8): against the range it expects him to sign for on the offer's terms, and the other teams
 * bidding, whose terms it can't see.
 */
export function standing(league: League, team: TeamAbbr, player: Player, offer: Offer): string {
  const { low, high } = floorEstimate(league, team, player, offer);
  const read =
    offer.salary >= high
      ? 'Your front office expects this to be enough for him'
      : offer.salary < low
        ? 'Your front office expects him to want more'
        : "Your front office can't tell whether this is enough for him";
  const others = offersFor(league, player.id).filter(o => o.team !== team).length;
  const rivals = others
    ? `He's weighing offers from ${plural(others, 'other team')} too; you can't see their terms.`
    : 'No other team has made him an offer yet.';
  return `${read}: it expects him to sign for ${dollars(low)} to ${dollars(high)} a year on these terms. ${rivals}`;
}

/**
 * His agent's counter to a team's standing offer he passed on (spec 11.6, 11.8): the offer's other terms at
 * the salary a year his agent asks on them, which the team can match by changing its offer.
 */
export function agentCounter(league: League, team: TeamAbbr, player: Player, offer: Offer): Offer {
  const ctx = contextFor(league);
  const need = reachable(league, ctx, player, team, offer.years, askedWorth(league, player, team));
  const salary = salaryFor(league, ctx, player, team, { ...offer, final: false }, need, minimumSalary(league.rules, player.experience)); // prettier-ignore
  return { ...offer, salary, final: false };
}

/**
 * Where a free agent still weighing a team's offer stands, in words for its inbox (spec 11.8): how many other
 * teams have offered, never their terms, and what his agent wants on the team's terms.
 */
export function weighingWords(league: League, team: TeamAbbr, player: Player): string {
  const offers = offersFor(league, player.id);
  const mine = offers.find(o => o.team === team);
  const others = offers.length - (mine ? 1 : 0);
  const rivals = others ? `weighing ${plural(others, 'other offer')} too` : 'no other offers yet';
  return mine
    ? `${rivals}; his agent wants ${dollars(agentCounter(league, team, player, mine.offer).salary)} a year on your terms`
    : rivals;
}

/** A signing's words for news and the inbox: "Name (POS), 3 years, $12,000,000 a year". */
export const signingWords = (s: FreeAgentSigning): string =>
  `${fullName(s.player)} (${s.player.position}), ${plural(s.offer.years, 'year')}, ${dollars(offerAav(s.offer))} a year`;

/** Free agents still weighing a team's standing offers. */
export const weighing = (league: League, team: TeamAbbr): Player[] =>
  pendingFor(league, team).players.flatMap(id => (league.players[id] ? [league.players[id]] : []));

/** Every team with a standing offer to anyone. */
export const bidders = (league: League): TeamAbbr[] =>
  TEAM_ABBRS.filter(t => Object.values(league.faOffers).some(list => list.some(o => o.team === t)));
