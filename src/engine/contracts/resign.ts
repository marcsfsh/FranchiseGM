/**
 * The re-sign window (spec 4.1, 11.4, 11.5): what each expiring player is (an unrestricted, restricted, or
 * exclusive-rights free agent to be), what a franchise or transition tag, a tender, or a fifth-year option
 * would pay him, and which decisions are open. The moves themselves are checked in src/engine/roster/moves.ts.
 */
import type { TeamAbbr } from '../../data/team-colors';
import type { League } from '../league/types';
import { leagueYear, PHASES } from '../model/calendar';
import type { Player } from '../model/player';
import type { Position } from '../model/positions';
import { expectedNextCap } from '../cap/growth';
import { minimumSalary, type RuleSet } from '../rules/ruleset';
import { dollars } from '../text';
import { termsProblem, type Offer } from './build';
import { askingFrom, contextFor, demand, offerWorth, reachable } from './decision';
import { capHit } from './cap';
import { endContract } from './moves';
import type { Contract, ContractEnd } from './types';
import { putContract } from '../league/contract-index';

/** Tag positions (spec 11.5): the offensive line is one, the defensive line two, the specialists one. */
export const TAG_POSITION: Record<Position, string> = {
  QB: 'QB', HB: 'RB', FB: 'RB', WR: 'WR', TE: 'TE', LT: 'OL', LG: 'OL', C: 'OL', RG: 'OL', RT: 'OL',
  LE: 'DE', RE: 'DE', DT: 'DT', LOLB: 'LB', MLB: 'LB', ROLB: 'LB', CB: 'CB', FS: 'S', SS: 'S',
  K: 'K/P', P: 'K/P', LS: 'K/P'
}; // prettier-ignore

export type FreeAgentKind = 'unrestricted' | 'restricted' | 'exclusive';
export type TagKind = 'exclusive' | 'nonExclusive' | 'transition';
export type TenderLevel = 'first' | 'second' | 'original' | 'refusal' | 'exclusive';

export const TAG_LABELS: Record<TagKind, string> = {
  exclusive: 'Exclusive franchise tag',
  nonExclusive: 'Non-exclusive franchise tag',
  transition: 'Transition tag'
};
export const TENDER_LABELS: Record<TenderLevel, string> = {
  first: 'First-round tender',
  second: 'Second-round tender',
  original: 'Original-round tender',
  refusal: 'Right of first refusal',
  exclusive: 'Exclusive rights tender'
};

/** A deal's running years: void years only spread proration, and an option year runs once exercised. */
const runningYears = (c: Contract): number[] =>
  c.years.filter(y => !y.isVoid && (y.option === null || y.optionExercised === true)).map(y => y.year);

/**
 * What a player whose deal runs out will be (spec 11.5): by accrued seasons, counting the one just played
 * once the season's over.
 */
export function freeAgentKind(league: League, player: Player): FreeAgentKind {
  const seasons = league.rules.tags.rfaSeasons;
  return player.accrued > seasons ? 'unrestricted' : player.accrued === seasons ? 'restricted' : 'exclusive';
}

/** A player's current deal, if any. */
export const currentDeal = (league: League, player: Player): Contract | undefined =>
  player.contractId ? league.contracts[player.contractId] : undefined;

/** Whether a player's deal runs out when this league year ends, with nothing signed to follow it. */
export function expiring(league: League, player: Player): boolean {
  const deal = currentDeal(league, player);
  if (!deal || !player.team || player.nextContractId) return false;
  return !runningYears(deal).some(y => y > leagueYear(league.date));
}

/** A team's players whose deals run out this league year. */
export function expiringPlayers(league: League, abbr: TeamAbbr): Player[] {
  return Object.values(league.players)
    .filter(p => p.team === abbr && p.status !== 'practice' && expiring(league, p))
    .sort((a, b) => b.ovr - a.ovr || (a.id < b.id ? -1 : 1));
}

/** The tag positions (spec 11.5). */
export const TAG_POSITIONS: readonly string[] = [...new Set(Object.values(TAG_POSITION))];

/** Cap hits this league year of the players at a tag position, largest first. */
function tagHits(league: League, tag: string): number[] {
  const year = leagueYear(league.date);
  const hits: number[] = [];
  for (const p of Object.values(league.players)) {
    if (TAG_POSITION[p.position] !== tag) continue;
    const c = currentDeal(league, p);
    if (c && !c.ended) hits.push(capHit(c, year, league.rules));
  }
  return hits.sort((a, b) => b - a);
}
const positionHits = (league: League, position: Position): number[] =>
  tagHits(league, TAG_POSITION[position]);

const average = (values: readonly number[]): number =>
  values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0;

/** A tag position's top cap hits as shares of its league year's cap (D-39): the top 5 and the top 10. */
export interface TagShare {
  franchise: number;
  transition: number;
}

/** A tag position's shares this league year, from the cap hits under contract now (D-39). */
function tagShareNow(league: League, tag: string): TagShare {
  const t = league.rules.tags;
  const cap = league.caps[leagueYear(league.date)] ?? league.rules.cap.amount;
  const hits = tagHits(league, tag);
  const share = (top: number) => Math.round((average(hits.slice(0, top)) / cap) * 1e6) / 1e6;
  return { franchise: share(t.franchiseTop), transition: share(t.transitionTop) };
}

/** Each tag position's shares this league year, from the cap hits under contract now (D-39). */
export const currentTagShares = (league: League): Record<string, TagShare> =>
  Object.fromEntries(TAG_POSITIONS.map(tag => [tag, tagShareNow(league, tag)]));

/**
 * A tag's price by the CBA's method (D-39): for each of the last five league years, this one included, the
 * top cap hits at the tag position as a share of that year's cap, averaged, times next league year's cap
 * as expected. Years before the league's first count at its first year's shares.
 */
function fiveYearPrice(league: League, tag: string, kind: keyof TagShare): number {
  const year = leagueYear(league.date);
  const live = { [tag]: tagShareNow(league, tag) };
  const first = Math.min(year, ...Object.keys(league.tagShares).map(Number));
  const shareIn = (y: number): number => (league.tagShares[y] ?? (y === year ? live : (league.tagShares[first] ?? live)))[tag]?.[kind] ?? 0;
  const shares = Array.from({ length: 5 }, (_, i) => shareIn(Math.max(first, year - i)));
  const cap = league.caps[year + 1] ?? expectedNextCap(league.rules);
  return Math.round((shares.reduce((a, b) => a + b, 0) / shares.length) * cap);
} // prettier-ignore

/** The tags a player has had in a row from his team, ending with this league year's deal. */
export function straightTags(league: League, player: Player, team: TeamAbbr): number {
  const year = leagueYear(league.date);
  const tags = new Set(
    Object.values(league.contracts)
      .filter(c => c.playerId === player.id && c.team === team && (c.type === 'franchiseTag' || c.type === 'transitionTag'))
      .flatMap(c => c.years.map(y => y.year))
  ); // prettier-ignore
  let n = 0;
  while (tags.has(year - n)) n++;
  return n;
}

/**
 * A tag's one-year salary (spec 11.5): for an exclusive franchise tag the average of the top 5 cap hits at
 * his tag position now, for the others the five-year price (D-39), or 120% of his salary this league year,
 * whichever is more; a second straight tag at least 120% of the last, a third at least 144% of it or the
 * quarterback tag.
 */
export function tagSalary(league: League, player: Player, kind: TagKind): number {
  const t = league.rules.tags;
  const year = leagueYear(league.date);
  const price = (tag: string) =>
    kind === 'exclusive' ? average(tagHits(league, tag).slice(0, t.franchiseTop)) : fiveYearPrice(league, tag, kind === 'transition' ? 'transition' : 'franchise');
  const deal = currentDeal(league, player);
  const prior = deal ? capHit(deal, year, league.rules) : 0;
  let salary = Math.max(price(TAG_POSITION[player.position]), Math.round(prior * t.priorSalaryShare));
  const team = player.team;
  const run = team ? straightTags(league, player, team) : 0;
  if (run === 1) salary = Math.max(salary, Math.round(prior * t.secondTag));
  if (run >= 2) salary = Math.max(salary, Math.round(prior * t.thirdTag), price('QB'));
  return Math.round(salary / 1000) * 1000;
} // prettier-ignore

/**
 * A tender level's amount under these rules (spec 11.5): a right of first refusal pays the original-round
 * amount, and an exclusive rights tender the minimum, so it has none of its own.
 */
export function tenderAmount(rules: RuleSet, level: TenderLevel): number {
  const t = rules.tags.tenders;
  if (level === 'exclusive') return 0;
  return level === 'first' ? t.firstRound : level === 'second' ? t.secondRound : t.originalRound;
}

/** A tender's one-year salary (spec 11.5): its level's amount, and at least 110% of his base this league year. */
export function tenderSalary(league: League, player: Player, level: TenderLevel): number {
  const t = league.rules.tags;
  const next = leagueYear(league.date) + 1;
  if (level === 'exclusive') return minimumSalary(league.rules, creditedNextYear(league, player));
  const base = currentDeal(league, player)?.years.find(y => y.year === next - 1)?.base ?? 0;
  return Math.max(tenderAmount(league.rules, level), Math.round((base * t.tenderPriorShare) / 1000) * 1000);
}

/** The tender levels open to a player whose deal runs out. */
export function tenderLevels(league: League, player: Player): TenderLevel[] {
  const kind = freeAgentKind(league, player);
  if (kind === 'restricted') return ['first', 'second', 'original', 'refusal'];
  return kind === 'exclusive' ? ['exclusive'] : [];
}

/** Whether the team already used its tag this league year (one per team, spec 11.5). */
export function tagUsed(league: League, team: TeamAbbr): boolean {
  const year = leagueYear(league.date);
  return Object.values(league.contracts).some(
    c => c.team === team && (c.type === 'franchiseTag' || c.type === 'transitionTag') && leagueYear(c.signed) === year
  ); // prettier-ignore
}

/** A first-round pick whose rookie deal just finished its third year, with his option open (spec 11.4). */
export function optionOpen(league: League, player: Player): boolean {
  const deal = currentDeal(league, player);
  return !!deal && deal.type === 'rookie' && deal.fifthYearOption === 'eligible' && deal.years[2]?.year === leagueYear(league.date);
} // prettier-ignore

/** The option tiers (spec 11.4, simplified): Pro Bowls stand in as rank at his tag position until M17's honors. */
export type OptionTier = 'franchise' | 'transition' | 'playingTime' | 'basic';

/** His rank by overall among players under contract at his tag position, from 1. */
function positionRank(league: League, player: Player): number {
  const tag = TAG_POSITION[player.position];
  return (
    Object.values(league.players).filter(p => p.team && TAG_POSITION[p.position] === tag && p.ovr > player.ovr).length + 1
  ); // prettier-ignore
}

/**
 * His share of his team's offensive or defensive snaps last regular season, whichever is more (spec 11.4):
 * the CBA's playing-time measure, from the one season the league keeps.
 */
export function snapShare(league: League, player: Player): number {
  const [offense, defense] = league.season.scrimmage[player.id] ?? [0, 0];
  const [teamOffense, teamDefense] = (player.team && league.season.teamScrimmage[player.team]) || [0, 0];
  return Math.max(teamOffense ? offense / teamOffense : 0, teamDefense ? defense / teamDefense : 0);
}

/**
 * A fifth-year option's tier and salary (spec 11.4, default, review): the franchise tag for the best three
 * at his tag position (two Pro Bowls in the CBA), the transition tag for the next five (one Pro Bowl), the
 * average of the 3rd to 20th cap hits at the position for a starter by snaps, otherwise the 3rd to 25th.
 */
export function optionSalary(league: League, player: Player): { tier: OptionTier; salary: number } {
  const t = league.rules.tags;
  const rank = positionRank(league, player);
  if (rank <= 3) return { tier: 'franchise', salary: tagSalary(league, player, 'nonExclusive') };
  if (rank <= 8) return { tier: 'transition', salary: tagSalary(league, player, 'transition') };
  const hits = positionHits(league, player.position);
  const snaps = snapShare(league, player);
  const [from, to] = snaps >= t.optionSnapShare ? t.optionPlayingTime : t.optionBasic;
  const salary = Math.max(minimumSalary(league.rules, player.experience), average(hits.slice(from - 1, to)));
  return {
    tier: snaps >= t.optionSnapShare ? 'playingTime' : 'basic',
    salary: Math.round(salary / 1000) * 1000
  };
}

/** The players a team has decisions on in the re-sign window: expiring deals, and fifth-year options. */
export function windowDecisions(league: League, abbr: TeamAbbr): { expiring: Player[]; options: Player[] } {
  const options = Object.values(league.players)
    .filter(p => p.team === abbr && optionOpen(league, p))
    .sort((a, b) => b.ovr - a.ovr || (a.id < b.id ? -1 : 1));
  return { expiring: expiringPlayers(league, abbr), options };
}

/**
 * The credited seasons a player will have when the next league year opens: a season counts once its Super
 * Bowl week ends (closeSeason), so from then until the new league year he has them all, and before then
 * the season under way or still to come adds one.
 */
export function creditedNextYear(league: League, player: Player): number {
  const phase = PHASES.indexOf(league.date.phase);
  const credited = phase > PHASES.indexOf('superBowl') && phase < PHASES.indexOf('freeAgency');
  return player.experience + (credited ? 0 : 1);
}

/**
 * Why a player whose deal runs out turns down an extension at the market, as a team's GM settles it, or null
 * if he signs it (spec 11.7): he weighs it like a free agent's offer, from the team he's on, and asks the
 * offseason's share of his market value whenever he's asked.
 */
export function extensionProblem(league: League, player: Player, offer: Offer): string | null {
  const minimum = minimumSalary(league.rules, creditedNextYear(league, player));
  const terms = termsProblem(league.rules, offer, minimum);
  if (terms) return terms;
  const team = player.team;
  if (!team) return "He isn't under contract.";
  const ctx = contextFor(league);
  const need = reachable(league, ctx, player, team, offer.years, demand(league, player, true));
  if (offerWorth(league, ctx, player, team, offer).total >= need) return null;
  return `He wants at least ${dollars(askingFrom(league, ctx, player, team, offer.years, demand(league, player, true), minimum))} a year to stay.`;
} // prettier-ignore

/**
 * Ends the deal a player signed to follow his current one when he leaves first: a tag or tender is
 * rescinded and costs nothing; an extension ends the way his current deal did, so its bonus accelerates.
 */
export function endPending(league: League, player: Player, end: ContractEnd): void {
  const id = player.nextContractId;
  delete player.nextContractId;
  const pending = id ? league.contracts[id] : undefined;
  if (!pending || pending.ended) return;
  const rescinded =
    pending.type === 'franchiseTag' || pending.type === 'transitionTag' || pending.type === 'rfaTender';
  putContract(league, endContract(pending, rescinded ? { ...end, how: 'replaced' } : end));
}
