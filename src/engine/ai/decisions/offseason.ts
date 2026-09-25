/**
 * Offseason roster building for AI teams, standing in until later milestones build the full systems (D-27):
 * each free agency week a team signs free agents at their asking price where a position group is short of
 * the standard roster (M12 brings bidding and negotiation), a team over the cap when the league year opens
 * releases players until it's under, and the final cutdown releases the least valuable players in the
 * deepest groups down to the in-season limit (spec 12.1). Every move goes through the checked transactions.
 */
import type { TeamAbbr } from '../../../data/team-colors';
import { capSheet, seasonSpace } from '../../cap/sheet';
import { askingSalary } from '../../contracts/acceptance';
import type { League } from '../../league/types';
import { calendarDay } from '../../model/calendar';
import { ageOn, fullName, type Player } from '../../model/player';
import type { Rng } from '../../rng';
import { minimumSalary } from '../../rules/ruleset';
import { makeMove, previewMove } from '../../roster/moves';
import { cannotPlay, designation } from '../../season/injuries';
import { TUNING } from '../../tuning';
import { need, quality, youth, type SigningOption } from '../considerations/roster';
import { decide, type DecisionLog } from '../framework';
import { competence, staffIn } from '../profile';
import { groupWords, NEED_GROUP, TARGET } from './roster-moves';

const O = TUNING.offseason;
const S = TUNING.ai.signing;

const teamPlayers = (league: League, abbr: TeamAbbr): Player[] =>
  Object.values(league.players).filter(p => p.team === abbr);

/** Players each group is short of the standard roster's count, counting the active roster. */
export function shortfall(players: readonly Player[]): Map<string, number> {
  const count = new Map<string, number>();
  for (const p of players)
    if (p.status === 'active')
      count.set(NEED_GROUP[p.position], (count.get(NEED_GROUP[p.position]) ?? 0) + 1);
  return new Map([...TARGET].map(([group, n]) => [group, Math.max(0, n - (count.get(group) ?? 0))]));
}

/** Asking salaries by pool: the date and the players' ratings don't change during a step. */
const asks = new WeakMap<Player[], Map<string, number>>();
function ask(league: League, pool: Player[], p: Player): number {
  let known = asks.get(pool);
  if (!known) asks.set(pool, (known = new Map()));
  let value = known.get(p.id);
  if (value === undefined) known.set(p.id, (value = askingSalary(league, p)));
  return value;
}

/** Contract years for a free agent: longer for younger players. */
const termFor = (age: number): number => O.termByAge.find(([oldest]) => age <= oldest)?.[1] ?? 1;

/**
 * A week of free agency for an AI team: it signs the best free agents it can where it's short, keeping
 * `reserve` of cap space for its draft class. `pool` is the week's free agents, shared by the teams in
 * turn; signed players leave it.
 */
export function freeAgencySignings(
  league: League,
  abbr: TeamAbbr,
  pool: Player[],
  reserve: number,
  rng: Rng
): DecisionLog[] {
  const logs: DecisionLog[] = [];
  const skip = new Set<string>();
  const today = calendarDay(league.date);
  for (let tries = 0; tries < O.signingTries; tries++) {
    const short = shortfall(teamPlayers(league, abbr));
    if (![...short.values()].some(n => n > 0)) break;
    // The budget: what's left above the reserve must still fill every other open spot at the minimum, and
    // no one player takes more than a few spots' share of it.
    const open = [...short.values()].reduce((a, b) => a + b, 0);
    const minimum = minimumSalary(league.rules, 0);
    const space = capSheet(league, abbr).space;
    const available = space - reserve;
    const ceiling = Math.min(available - (open - 1) * minimum, (O.budgetShare * available) / open);
    const byGroup = new Map<string, Player[]>();
    for (const p of pool) {
      const group = NEED_GROUP[p.position];
      if (skip.has(p.id) || !short.get(group) || ask(league, pool, p) > Math.max(minimum, ceiling)) continue;
      byGroup.set(group, [...(byGroup.get(group) ?? []), p]);
    }
    const options: SigningOption[] = [...byGroup.values()].flatMap(players =>
      players
        .sort((a, b) => b.ovr - a.ovr || (a.id < b.id ? -1 : 1))
        .slice(0, S.candidatesPerGroup)
        .map(p => ({
          id: p.id,
          name: `${fullName(p)} (${p.position})`,
          need: short.get(NEED_GROUP[p.position]) ?? 0,
          ovr: p.ovr,
          age: ageOn(p.birthDate, today),
          own: false
        }))
    );
    const decision = decide(
      'Sign a free agent',
      `${abbr} general manager`,
      options,
      [need(), quality(), youth()],
      { need: S.needWeight, quality: 1, youth: S.youthWeight },
      competence(staffIn(league, abbr, 'GM'), 'evaluation'),
      rng,
      o => o.name
    );
    const player = decision ? league.players[decision.chosen.id] : undefined;
    if (!decision || !player) break;
    skip.add(player.id);
    const offer = { years: termFor(ageOn(player.birthDate, today)), salary: ask(league, pool, player), signingBonus: 0 };
    const move = { kind: 'sign', team: abbr, playerId: player.id, offer, reason: `to fill a need at ${groupWords(player)}` } as const;
    // The move checks the cap itself; the reserve for the draft class is this team's own rule.
    if (space - offer.salary < reserve) continue;
    if (makeMove(league, move, rng).ok) {
      logs.push(decision.log);
      pool.splice(pool.indexOf(player), 1);
    }
  } // prettier-ignore
  return logs;
}

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

/** What a player is worth keeping: his overall, and for a young player part of the way to his potential. */
function keepValue(league: League, p: Player): number {
  const age = ageOn(p.birthDate, calendarDay(league.date));
  return p.ovr + (age <= O.cutYoungAge ? O.cutPotentialWeight * Math.max(0, p.potential - p.ovr) : 0);
}

/**
 * The player to let go: the least valuable healthy player in a group over its standard count (the deepest
 * group first), or anyone healthy once no group has extra. Players in `skip` stay.
 */
function nextCut(league: League, abbr: TeamAbbr, skip: ReadonlySet<string>): Player | null {
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

/**
 * Releases players until the team is under the cap, the least valuable first (a release that frees no room
 * is skipped). With `season`, every roster charge counts, as it will once the regular season starts.
 */
export function capCompliance(league: League, abbr: TeamAbbr, rng: Rng, season = false): void {
  const skip = new Set<string>();
  const space = () => (season ? seasonSpace(capSheet(league, abbr)) : capSheet(league, abbr).space);
  while (space() < 0) {
    const cut = nextCut(league, abbr, skip);
    if (!cut) break;
    skip.add(cut.id);
    const move = {
      kind: 'release',
      team: abbr,
      playerId: cut.id,
      reason: 'to get under the salary cap'
    } as const;
    // A release that adds dead money beyond what it saves doesn't help.
    const preview = previewMove(league, move);
    if (preview.ok && preview.value.spaceAfter > preview.value.spaceBefore) makeMove(league, move, rng);
  }
}

/** The final cutdown (spec 12.1): releases down to the in-season limit. */
export function cutdown(league: League, abbr: TeamAbbr, rng: Rng): Player[] {
  const limit = league.rules.roster.active;
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
