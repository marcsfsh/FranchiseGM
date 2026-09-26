/**
 * The UDFA scramble (spec 10.4, 11.7; D-49). From the draft's end through the undrafted free agents step,
 * teams offer the rookies nobody drafted the undrafted deal (three years at the minimum) with a signing
 * bonus, out of a pool each team has. As the step ends, each rookie signs with the team whose offer looks
 * best to him by the player decision model: the bonus, weighed by his greed, and his chance to make the
 * roster, weighed more, with the team's standing, his home, and his fit (D-52). A team at its roster's
 * limit or without the cap room signs nobody; a rookie it can't sign takes his next offer. The AI offers
 * to the rookies it values most where its roster is thinnest.
 */
import type { TeamAbbr } from '../../data/team-colors';
import { udfaContract } from '../contracts/build';
import { contextFor, offerWorth } from '../contracts/decision';
import { capSheet } from '../cap/sheet';
import { ACTIVE_ROSTER } from '../generate/league';
import { signRookie } from '../generate/rookies';
import { freeAgents, newId, recordTransaction } from '../league/transactions';
import type { League } from '../league/types';
import { leagueYear } from '../model/calendar';
import type { Player } from '../model/player';
import type { Position } from '../model/positions';
import type { Rng } from '../rng';
import { minimumSalary } from '../rules/ruleset';
import { activeLimit, rosterCounts } from '../roster/rules';
import { dollars } from '../text';
import { TUNING } from '../tuning';
import { draftValue } from './class';
import { draftUnderWay } from './draft';
import { needs } from './needs';

const U = TUNING.draft.udfa;
const SPOTS = new Map<Position, number>(ACTIVE_ROSTER.map(([p, n]) => [p, n]));
const ON_ROSTER = new Set<Player['status']>([
  'active',
  'practice',
  'ir',
  'pup',
  'nfi',
  'suspended',
  'holdout'
]);

/** A team's offer to an undrafted rookie: the undrafted deal with this signing bonus. */
export interface UdfaOffer {
  team: TeamAbbr;
  bonus: number;
}

/** This league year's undrafted rookies still looking for a team. */
export function undraftedRookies(league: League): Player[] {
  const year = leagueYear(league.date);
  return freeAgents(league).filter(
    p => p.experience === 0 && 'undrafted' in p.draft && p.draft.year === year
  );
}

/** Whether rookies take offers now: from the draft's end through the undrafted free agents step. */
export function scrambleOpen(league: League): boolean {
  const { phase } = league.date;
  if (phase === 'udfa') return true;
  return phase === 'draft' && !draftUnderWay(league) && league.draftGrades?.year === leagueYear(league.date);
}

/**
 * A rookie's chance to make a team's roster, from 0 to 1: the spots a standard roster has at his position
 * against the players the team has there as good as he is.
 */
export function opportunity(league: League, team: TeamAbbr, player: Player): number {
  const spots = SPOTS.get(player.position) ?? 1;
  const ahead = Object.values(league.players).filter(
    p => p.team === team && p.position === player.position && ON_ROSTER.has(p.status) && p.ovr >= player.ovr
  ).length;
  return Math.max(0, Math.min(1, (spots + 1 - ahead) / (spots + 1)));
}

/**
 * How an offer looks to a rookie, by the player decision model (spec 11.7, D-52): its money is the bonus
 * against the most a team may offer, weighed by his greed, and his role his chance to make the team, which
 * weighs more (spec 10.4); a contender, his home state, and his fit count as for any free agent.
 */
export function offerScore(league: League, player: Player, offer: UdfaOffer): number {
  const [low, high] = U.moneyWeight;
  const money = low + ((high - low) * player.personality.greed) / 100;
  const deal = { years: 3, salary: minimumSalary(league.rules, 0), signingBonus: offer.bonus };
  const worth = offerWorth(league, contextFor(league), player, offer.team, deal);
  return money * (offer.bonus / U.maxBonus) + U.opportunityWeight * opportunity(league, offer.team, player) + worth.contender + worth.home + worth.fit;
} // prettier-ignore

/** A rookie's offers, the best to him first. */
export function offersFor(league: League, player: Player): UdfaOffer[] {
  return [...(league.udfaOffers[player.id] ?? [])].sort(
    (a, b) => offerScore(league, player, b) - offerScore(league, player, a) || (a.team < b.team ? -1 : 1)
  );
}

/** The bonuses a team has offered, in all. */
export function pledged(league: League, team: TeamAbbr): number {
  let total = 0;
  for (const offers of Object.values(league.udfaOffers))
    for (const o of offers) if (o.team === team) total += o.bonus;
  return total;
}

/** Why a team can't offer a rookie `bonus` now, or null. */
export function offerProblem(league: League, team: TeamAbbr, playerId: string, bonus: number): string | null {
  if (!scrambleOpen(league))
    return 'Undrafted rookies take offers from the end of the draft through the undrafted free agents step.';
  const player = league.players[playerId];
  if (!player || !undraftedRookies(league).includes(player))
    return "He isn't an undrafted rookie looking for a team.";
  if (!Number.isInteger(bonus) || bonus < 0 || bonus > U.maxBonus || bonus % U.step)
    return `Offer a signing bonus from $0 to ${dollars(U.maxBonus)}, in steps of ${dollars(U.step)}.`;
  const mine = league.udfaOffers[playerId]?.find(o => o.team === team)?.bonus ?? 0;
  const pool = league.rules.rookieScale.udfaBonusPool;
  const left = pool - (pledged(league, team) - mine);
  if (bonus > left) return `That's more than your bonus pool has left: ${dollars(left)} of ${dollars(pool)}.`;
  return null;
}

/** Makes or changes a team's offer to a rookie. Returns why not, or null. */
export function makeOffer(league: League, team: TeamAbbr, playerId: string, bonus: number): string | null {
  const problem = offerProblem(league, team, playerId, bonus);
  if (problem) return problem;
  const others = (league.udfaOffers[playerId] ?? []).filter(o => o.team !== team);
  league.udfaOffers[playerId] = [...others, { team, bonus }];
  return null;
}

/** Takes back a team's offer to a rookie. */
export function withdrawOffer(league: League, team: TeamAbbr, playerId: string): void {
  const left = (league.udfaOffers[playerId] ?? []).filter(o => o.team !== team);
  if (left.length) league.udfaOffers[playerId] = left;
  else delete league.udfaOffers[playerId];
}

/**
 * The AI's offers (D-49): each team offers to the rookies worth most to it, by his value and its need at his
 * position, as many as its roster has room for up to `offersPerTeam`; its pool goes out in shrinking
 * bonuses, the first rookie the most.
 */
export function aiOffers(league: League, teams: readonly TeamAbbr[], rng: Rng): void {
  const rookies = undraftedRookies(league);
  for (const team of teams) {
    const room = activeLimit(league) - rosterCounts(league, team).active;
    const count = Math.min(room, U.offersPerTeam);
    if (count <= 0) continue;
    const needAt = needs(league, team);
    const worth = (p: Player) =>
      draftValue(p) + TUNING.draft.needs.weight * (needAt.get(p.position) ?? 0) + rng.normal(0, U.noise);
    const targets = rookies
      .map(p => ({ p, worth: worth(p) }))
      .sort((a, b) => b.worth - a.worth || (a.p.id < b.p.id ? -1 : 1))
      .slice(0, count);
    const pool = league.rules.rookieScale.udfaBonusPool;
    let left = pool - pledged(league, team);
    targets.forEach(({ p }, i) => {
      const share = U.topShare * U.shrink ** i;
      const bonus = Math.min(left, U.maxBonus, Math.round((pool * share) / U.step) * U.step);
      if (bonus < 0 || makeOffer(league, team, p.id, bonus)) return;
      left -= bonus;
    });
  }
}

export interface UdfaSigning {
  player: Player;
  team: TeamAbbr;
  bonus: number;
}

/**
 * The scramble's end (spec 10.4): each rookie with offers, the most valuable first, signs with the team whose
 * offer looks best to him that has room on its roster and under the cap; the offers clear. Returns the
 * signings.
 */
export function signUdfas(league: League, rng: Rng): UdfaSigning[] {
  const year = leagueYear(league.date);
  const signed: UdfaSigning[] = [];
  const rookies = undraftedRookies(league)
    .filter(p => league.udfaOffers[p.id]?.length)
    .sort((a, b) => draftValue(b) - draftValue(a) || (a.id < b.id ? -1 : 1));
  for (const player of rookies)
    for (const offer of offersFor(league, player)) {
      const { team, bonus } = offer;
      if (rosterCounts(league, team).active >= activeLimit(league)) continue;
      const deal = udfaContract(league.rules, { id: 'preview', playerId: player.id, team }, year, bonus);
      if (capSheet(league, team, year, { add: [{ contract: deal, status: 'active' }] }).space < 0) continue;
      const contract = { ...deal, id: newId(league, 'c') };
      league.contracts[contract.id] = contract;
      signRookie(league, player, team, contract.id, rng);
      recordTransaction(league, team, 'signed', player.id, 'an undrafted rookie');
      signed.push({ player, team, bonus });
      break;
    }
  league.udfaOffers = {};
  return signed;
}
