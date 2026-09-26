/**
 * Compensatory picks (spec 11.8; D-58). A league year's qualifying free agents are the unrestricted ones
 * whose deals ran out as it opened and who signed with another team from free agency's first week through
 * the draft, for a deal whose yearly value ranks in the top 35% of the league's deals, and who are still on
 * that team. Each is worth a round by that rank, a round better for a starter's snaps with his new team and
 * a round worse for a part-timer's (postseason honors join with M17). A team's qualifying signings cancel
 * its losses, each the best loss of its round, else the best loss of a later round, else the worst one left;
 * a team that lost more than it signed gets a pick for each loss left, its best few, and the league's best
 * are awarded. A team that lost as many as it signed, but lost clearly more value, gets a seventh-round
 * pick while the league's limit isn't reached, and supplemental seventh-round picks in draft order fill the
 * rest, as the NFL awards exactly 32. They're awarded at the annual meeting, after each round's regular
 * picks.
 */
import { TEAM_ABBRS, type TeamAbbr } from '../../data/team-colors';
import { snapShare } from '../contracts/resign';
import { contractSummary } from '../contracts/view';
import type { League } from '../league/types';
import { leagueYear, type Phase } from '../model/calendar';
import { TUNING } from '../tuning';
import { latestDraftOrder, numberDraft } from './picks';

const C = TUNING.compPicks;

/** The signings that count: from free agency's first week through the draft (spec 11.8). */
const PERIOD: ReadonlySet<Phase> = new Set<Phase>(['freeAgency', 'proDays', 'draft']);

/** Deals the ranking leaves out: a practice squad player isn't among the league's players. */
const UNRANKED = new Set(['practiceSquad']);

/** A free agent who left one team for another, and the round he's worth. */
export interface QualifyingFreeAgent {
  playerId: string;
  from: TeamAbbr;
  to: TeamAbbr;
  round: number;
  /** His new deal's yearly value. */
  apy: number;
}

/**
 * A compensatory pick: for a net loss of qualifying free agents, the one it's for; for a net loss of their
 * value, the team's best loss; or supplemental, filling the league's limit.
 */
export interface CompensatoryPick {
  team: TeamAbbr;
  round: number;
  kind: 'netLoss' | 'netValue' | 'supplemental';
  lost: QualifyingFreeAgent | null;
}

/** Best first: the earlier round, then the bigger deal. */
const best = (a: QualifyingFreeAgent, b: QualifyingFreeAgent): number =>
  a.round - b.round || b.apy - a.apy || (a.playerId < b.playerId ? -1 : 1);

/** This league year's qualifying free agents (spec 11.8), each with his round. */
export function qualifyingFreeAgents(league: League): QualifyingFreeAgent[] {
  const gone = league.departures;
  if (!gone || gone.year !== leagueYear(league.date)) return [];
  const apys = Object.values(league.players)
    .flatMap(p => {
      const c = p.team && p.contractId ? league.contracts[p.contractId] : undefined;
      return c && !UNRANKED.has(c.type) ? [contractSummary(c, league.date).apy] : [];
    })
    .sort((a, b) => a - b);
  /** The share of the league's veteran deals paying at least this much a year. */
  const topShare = (apy: number): number => {
    let low = 0;
    let high = apys.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if ((apys[mid] ?? 0) < apy) low = mid + 1;
      else high = mid;
    }
    return (apys.length - low) / Math.max(1, apys.length);
  };
  const [first, last] = league.rules.season.compensatoryRounds;
  const out: QualifyingFreeAgent[] = [];
  for (const [id, from] of Object.entries(gone.players)) {
    const p = league.players[id];
    const to = p?.team;
    const c = p?.contractId ? league.contracts[p.contractId] : undefined;
    if (!p || !to || to === from || !c || c.team !== to) continue;
    if (leagueYear(c.signed) !== gone.year || !PERIOD.has(c.signed.phase)) continue;
    const apy = contractSummary(c, league.date).apy;
    const tier = C.rounds.find(([share]) => topShare(apy) <= share);
    if (!tier) continue;
    const snaps = snapShare(league, p);
    const round = Math.max(first, tier[1] + (snaps >= C.starter ? -1 : snaps < C.partTime ? 1 : 0));
    if (round <= last) out.push({ playerId: id, from, to, round, apy });
  }
  return out.sort(best);
}

/** Free agents' worth in rounds: a third-round loss is worth 5, a seventh-round one 1. */
const worth = (list: readonly QualifyingFreeAgent[], last: number): number =>
  list.reduce((total, q) => total + last + 1 - q.round, 0);

/**
 * The compensatory picks this league year's free agency earns (spec 11.8), best first: each team's losses
 * left after its signings cancel theirs, its best few, and the league's best; then net value picks, and
 * supplemental picks to teams in the draft's `order`, to the league's limit.
 */
export function compensatoryPicks(league: League, order: readonly TeamAbbr[] = []): CompensatoryPick[] {
  // A league's first draft follows a free agency it didn't see, so it has none.
  if (league.departures?.year !== leagueYear(league.date)) return [];
  const cfas = qualifyingFreeAgents(league);
  const rules = league.rules.season;
  const last = rules.compensatoryRounds[1];
  const earned: CompensatoryPick[] = [];
  const netValue: { team: TeamAbbr; margin: number; best: QualifyingFreeAgent }[] = [];
  for (const team of TEAM_ABBRS) {
    const left = cfas.filter(q => q.from === team);
    const gained = cfas.filter(q => q.to === team);
    const [best] = left;
    if (!best || left.length < gained.length) continue;
    if (left.length === gained.length) {
      const margin = worth(left, last) - worth(gained, last);
      if (margin >= C.netValueRounds) netValue.push({ team, margin, best });
      continue;
    }
    for (const g of gained) {
      const same = left.findIndex(l => l.round === g.round);
      const later = left.findIndex(l => l.round > g.round);
      left.splice(same >= 0 ? same : later >= 0 ? later : left.length - 1, 1);
    }
    for (const lost of left.slice(0, rules.compensatoryPerTeam))
      earned.push({ team, round: lost.round, kind: 'netLoss', lost });
  }
  const picks = earned
    .sort((a, b) => best(a.lost as QualifyingFreeAgent, b.lost as QualifyingFreeAgent))
    .slice(0, rules.compensatoryPicks);
  netValue.sort((a, b) => b.margin - a.margin || best(a.best, b.best));
  for (const { team, best: lost } of netValue.slice(0, rules.compensatoryPicks - picks.length))
    picks.push({ team, round: last, kind: 'netValue', lost });
  const held = (team: TeamAbbr) => picks.filter(p => p.team === team).length;
  for (const team of order) {
    if (picks.length >= rules.compensatoryPicks) break;
    if (held(team) < rules.compensatoryPerTeam)
      picks.push({ team, round: last, kind: 'supplemental', lost: null });
  }
  return picks;
}

/**
 * Awards the compensatory picks in the draft of league year `year` (spec 11.8), at the annual meeting, and
 * numbers them after each round's regular picks, best first. Returns the picks awarded.
 */
export function awardCompensatoryPicks(league: League, year: number): CompensatoryPick[] {
  if (league.picks.some(p => p.year === year && p.compensatory)) return [];
  const order = latestDraftOrder(league);
  const picks = compensatoryPicks(league, order ?? []);
  const count = new Map<TeamAbbr, number>();
  for (const pick of picks) {
    const n = (count.get(pick.team) ?? 0) + 1;
    count.set(pick.team, n);
    league.picks.push({ id: `${year}-${pick.round}-${pick.team}-c${n}`, year, round: pick.round, original: pick.team, owner: pick.team, compensatory: true, number: null, playerId: null }); // prettier-ignore
  }
  if (order) numberDraft(league, year, order);
  return picks;
}
