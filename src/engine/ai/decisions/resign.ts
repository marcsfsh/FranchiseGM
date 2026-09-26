/**
 * AI decisions in the re-sign window (spec 11.4, 11.5), standing in until M14's AI brain (D-29). A team
 * exercises a fifth-year option when the player's value covers it, keeps the expiring players it would miss
 * (those who'd still rank within the standard roster's count at their position group), and pays for them
 * best first while next year's cap keeps room for the draft class and free agency: an extension at the
 * price its GM settles (spec 11.6) when his projected value over it covers its cost (D-38), or the
 * franchise tag when he asks for more than the tag costs and a year of him is worth it; restricted free
 * agents get the highest tender their value reaches, and exclusive-rights players the minimum tender.
 */
import type { TeamAbbr } from '../../../data/team-colors';
import { capFacts, capSheet } from '../../cap/sheet';
import { releaseImpact } from '../../contracts/cap';
import { typicalOffer } from '../../contracts/build';
import { settledSalary, termFor } from '../../contracts/negotiation';
import { dealValue, roomPremium, worthIt } from '../../contracts/value';
import {
  freeAgentKind,
  optionSalary,
  tagSalary,
  tagUsed,
  tenderSalary,
  windowDecisions,
  type TenderLevel
} from '../../contracts/resign';
import { rookieReserve } from '../../generate/rookies';
import type { League } from '../../league/types';
import { calendarDay, leagueYear } from '../../model/calendar';
import { ageOn, type Player } from '../../model/player';
import type { Rng } from '../../rng';
import { makeMove, type Move } from '../../roster/moves';
import { minimumSalary } from '../../rules/ruleset';
import { TUNING } from '../../tuning';
import { groupWords, NEED_GROUP, TARGET } from './roster-moves';

const R = TUNING.resign;

/** A move with the team left out. */
type TeamMove = Move extends infer M ? (M extends Move ? Omit<M, 'team'> : never) : never;

/** Whether the team would miss a player: he'd rank within the standard count at his group. */
function wantedOn(league: League, abbr: TeamAbbr): (player: Player) => boolean {
  const byGroup = new Map<string, number[]>();
  for (const p of Object.values(league.players))
    if (p.team === abbr && p.status !== 'practice') byGroup.set(NEED_GROUP[p.position], [...(byGroup.get(NEED_GROUP[p.position]) ?? []), p.ovr]);
  return player => {
    const group = NEED_GROUP[player.position];
    const better = (byGroup.get(group) ?? []).filter(ovr => ovr > player.ovr).length;
    return better < (TARGET.get(group) ?? 0);
  };
} // prettier-ignore

export function resignDecisions(league: League, abbr: TeamAbbr, rng: Rng): void {
  const year = leagueYear(league.date);
  const today = calendarDay(league.date);
  const move = (m: TeamMove): boolean => makeMove(league, { ...m, team: abbr } as Move, rng).ok;
  const { expiring, options } = windowDecisions(league, abbr);

  for (const p of options) {
    const exercise =
      settledSalary(league, p, abbr, 1, true) >= R.optionValue * optionSalary(league, p).salary;
    move({
      kind: 'option',
      playerId: p.id,
      exercise,
      reason: exercise ? 'worth his option' : 'not worth his option'
    });
  }

  // Next year's room above the draft class and a cushion for free agency.
  const reserve = rookieReserve(league, abbr) + R.freeAgencyRoom * league.rules.cap.amount;
  const room = () => capSheet(league, abbr, year + 1).space - reserve;
  const wanted = wantedOn(league, abbr);
  for (const p of expiring.filter(wanted)) {
    const kind = freeAgentKind(league, p);
    const years = termFor(ageOn(p.birthDate, today));
    const ask = settledSalary(league, p, abbr, years, true);
    const reason = `to keep him at ${groupWords(p)}`;
    if (kind === 'exclusive') {
      move({ kind: 'tender', playerId: p.id, level: 'exclusive', reason });
      continue;
    }
    if (kind === 'restricted') {
      const levels: TenderLevel[] = ['first', 'second', 'original'];
      const level = levels.find(l => ask >= tenderSalary(league, p, l)) ?? 'refusal';
      if (tenderSalary(league, p, level) <= room()) move({ kind: 'tender', playerId: p.id, level, reason });
      continue;
    }
    const tag = tagSalary(league, p, 'nonExclusive');
    if (
      ask > tag &&
      !tagUsed(league, abbr) &&
      p.ovr >= R.tagOvr &&
      tag <= room() &&
      dealValue(league, p, 1) >= tag
    ) {
      move({ kind: 'tag', playerId: p.id, tag: 'nonExclusive', reason });
      continue;
    }
    const offer = typicalOffer(league.rules, years, ask, minimumSalary(league.rules, p.experience));
    const left = room();
    if (ask > left || !worthIt(league, p, offer, roomPremium(league, left))) continue;
    move({ kind: 'extend', playerId: p.id, offer, reason });
  }
}

/** Deals a cap cut never ends: the rookie scale's, and a tag's single year. */
const UNCUT = new Set(['rookie', 'udfa', 'practiceSquad', 'franchiseTag', 'transitionTag']);

/**
 * Cap casualties as a league year opens (spec 11.1; D-60): a team releases the veterans whose deals would pay
 * them well more than they're worth over the years left, when a release saves room this league year, the
 * worst value first and at most a few. Their dead money stays on the cap, as NFL cap cuts leave it. Returns
 * the players released.
 */
export function capCasualties(league: League, abbr: TeamAbbr, rng: Rng): Player[] {
  const year = leagueYear(league.date);
  const cuts: { p: Player; gap: number }[] = [];
  for (const p of Object.values(league.players)) {
    const c = p.team === abbr && p.contractId ? league.contracts[p.contractId] : undefined;
    if (!c || UNCUT.has(c.type) || p.nextContractId) continue;
    const left = c.years.filter(y => y.year >= year && !y.isVoid);
    if (!left.length) continue;
    // What a release saves him being paid, and what he's worth over those years.
    const saved = left.reduce((sum, y) => sum + y.base - y.guaranteedBase, 0);
    const value = dealValue(league, p, left.length);
    if (value >= saved * R.cutValue) continue;
    const impact = releaseImpact(c, league.date, league.rules, {}, capFacts(league, p.id));
    if (impact.savings > 0) cuts.push({ p, gap: saved - value });
  }
  const released: Player[] = [];
  for (const { p } of cuts
    .sort((a, b) => b.gap - a.gap || (a.p.id < b.p.id ? -1 : 1))
    .slice(0, R.cutsPerTeam)) {
    const done = makeMove(league, { kind: 'release', team: abbr, playerId: p.id, reason: 'a cap casualty, paid more than he is worth' }, rng); // prettier-ignore
    if (done.ok) released.push(p);
  }
  return released;
}
