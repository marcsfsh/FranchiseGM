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
import { capSheet } from '../../cap/sheet';
import { settledSalary, termFor } from '../../contracts/negotiation';
import { dealValue, worthIt } from '../../contracts/value';
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
import { TUNING } from '../../tuning';
import { groupWords, NEED_GROUP, TARGET } from './roster-moves';

const R = TUNING.resign;

/** A move with the team left out. */
type TeamMove = Move extends infer M ? (M extends Move ? Omit<M, 'team'> : never) : never;

/** Whether the team would miss him: he'd rank within the standard count at his group. */
function wanted(league: League, abbr: TeamAbbr, player: Player): boolean {
  const group = NEED_GROUP[player.position];
  const better = Object.values(league.players).filter(
    p => p.team === abbr && p.status !== 'practice' && p.id !== player.id && NEED_GROUP[p.position] === group && p.ovr > player.ovr
  ).length; // prettier-ignore
  return better < (TARGET.get(group) ?? 0);
}

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
  for (const p of expiring.filter(p => wanted(league, abbr, p))) {
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
    const offer = { years, salary: ask, signingBonus: 0 };
    if (ask > room() || !worthIt(league, p, offer)) continue;
    move({ kind: 'extend', playerId: p.id, offer, reason });
  }
}
