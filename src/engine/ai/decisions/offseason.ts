/**
 * Offseason roster moves for AI teams: waiver claims, and the final cutdown, which releases the least
 * valuable players in the deepest groups down to the in-season limit (spec 12.1); free agency's bidding
 * lives with the contracts (D-53), and the compliance module gets teams under the cap. Every move goes
 * through the checked transactions.
 */
import type { TeamAbbr } from '../../../data/team-colors';
import type { League } from '../../league/types';
import { calendarDay } from '../../model/calendar';
import { ageOn, type Player } from '../../model/player';
import type { Rng } from '../../rng';
import { makeMove } from '../../roster/moves';
import { cannotPlay, designation } from '../../season/injuries';
import { TUNING } from '../../tuning';
import { NEED_GROUP, TARGET } from './roster-moves';

const O = TUNING.offseason;
const S = TUNING.ai.signing;

const teamPlayers = (league: League, abbr: TeamAbbr): Player[] =>
  Object.values(league.players).filter(p => p.team === abbr);

/**
 * AI waiver claims in the offseason: like the in-season claims, a team claims a player who beats its
 * weakest healthy player at his group by `claimMargin`, but only with room on its roster, since no weekly
 * cut follows. One pass over the league finds every team's room and its weakest at the group.
 */
export function offseasonClaims(league: League, player: Player, from: TeamAbbr, limit: number): TeamAbbr[] {
  const group = NEED_GROUP[player.position];
  const active = new Map<TeamAbbr, number>();
  const weakest = new Map<TeamAbbr, number>();
  for (const p of Object.values(league.players)) {
    if (!p.team || p.status !== 'active') continue;
    active.set(p.team, (active.get(p.team) ?? 0) + 1);
    if (NEED_GROUP[p.position] === group && !cannotPlay(designation(p.injury)))
      weakest.set(p.team, Math.min(weakest.get(p.team) ?? Infinity, p.ovr));
  }
  const user = league.settings.auto.roster ? null : league.meta.start.userTeam;
  return [...weakest]
    .filter(([abbr, low]) => abbr !== from && abbr !== user && (active.get(abbr) ?? 0) < limit && player.ovr >= low + S.claimMargin)
    .map(([abbr]) => abbr); // prettier-ignore
}

/**
 * What a player is worth keeping: his overall, for a young player part of the way to his potential, and for
 * a recent draft pick the team's investment in him.
 */
export function keepValue(league: League, p: Player): number {
  const age = ageOn(p.birthDate, calendarDay(league.date));
  const recent = p.experience < O.cutDraftSeasons;
  const pick = !recent
    ? 0
    : 'round' in p.draft
      ? (O.cutDraftBonus[p.draft.round - 1] ?? 0)
      : O.cutUndraftedBonus;
  return p.ovr + (age <= O.cutYoungAge ? O.cutPotentialWeight * Math.max(0, p.potential - p.ovr) : 0) + pick;
}

/**
 * The player to let go: the least valuable healthy player in a group over its standard count (the deepest
 * group first), or anyone healthy once no group has extra. Players in `skip` stay.
 */
export function nextCut(league: League, abbr: TeamAbbr, skip: ReadonlySet<string> = new Set()): Player | null {
  const active = teamPlayers(league, abbr).filter(
    p => p.status === 'active' && !skip.has(p.id) && !cannotPlay(designation(p.injury))
  );
  const byGroup = new Map<string, Player[]>();
  for (const p of active) byGroup.set(NEED_GROUP[p.position], [...(byGroup.get(NEED_GROUP[p.position]) ?? []), p]);
  const extra = [...byGroup]
    .map(([group, players]) => ({ players, over: players.length - (TARGET.get(group) ?? 0) }))
    .filter(g => g.over > 0)
    .sort((a, b) => b.over - a.over);
  const pool = extra[0]?.players ?? active;
  return [...pool].sort((a, b) => keepValue(league, a) - keepValue(league, b) || (a.id < b.id ? -1 : 1))[0] ?? null;
} // prettier-ignore

/** The final cutdown (spec 12.1): releases down to the in-season limit, or to `limit`. */
export function cutdown(
  league: League,
  abbr: TeamAbbr,
  rng: Rng,
  limit = league.rules.roster.active
): Player[] {
  const released: Player[] = [];
  const skip = new Set<string>();
  const count = () => teamPlayers(league, abbr).filter(p => p.status === 'active').length;
  while (count() > limit) {
    const cut = nextCut(league, abbr, skip);
    if (!cut) break;
    skip.add(cut.id);
    if (
      makeMove(league, { kind: 'release', team: abbr, playerId: cut.id, reason: 'in the final cutdown' }, rng)
        .ok
    )
      released.push(cut);
  }
  return released;
}
