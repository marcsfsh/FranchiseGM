/**
 * In-season roster moves for AI teams (spec 12.1, 14.11): injured reserve for players out at least the
 * minimum, activations for healed players while the team has designations left, and signings where the
 * roster is thinnest, from free agency or the team's own practice squad. A group that short injuries leave below a lineup's worth gets a signing for
 * the week, and a player from the deepest group makes room. The general manager decides the signings.
 */
import type { TeamAbbr } from '../../../data/team-colors';
import { ACTIVE_ROSTER } from '../../generate/league';
import {
  activateFromInjuredReserve,
  freeAgents,
  gamesOnReserve,
  irReturnsUsed,
  placeOnInjuredReserve,
  promoteFromPracticeSquad,
  releasePlayer,
  signFreeAgent
} from '../../league/transactions';
import { startersOf } from '../../league/depth';
import type { League } from '../../league/types';
import { calendarDay } from '../../model/calendar';
import { ageOn, fullName, type Player } from '../../model/player';
import type { Position } from '../../model/positions';
import type { Rng } from '../../rng';
import { cannotPlay, designation } from '../../season/injuries';
import { TUNING } from '../../tuning';
import { familiar, need, quality, youth, type SigningOption } from '../considerations/roster';
import { decide, type DecisionLog } from '../framework';
import { competence, staffIn } from '../profile';

const S = TUNING.ai.signing;

/** Position groups for roster needs: both sides of the line, and both safeties, count together. */
export const NEED_GROUP: Record<Position, string> = {
  QB: 'QB', HB: 'RB', FB: 'FB', WR: 'WR', TE: 'TE', LT: 'OT', RT: 'OT', LG: 'OG', RG: 'OG', C: 'C',
  LE: 'DE', RE: 'DE', DT: 'DT', LOLB: 'OLB', ROLB: 'OLB', MLB: 'MLB', CB: 'CB', FS: 'S', SS: 'S',
  K: 'K', P: 'P', LS: 'LS'
}; // prettier-ignore

/** The standard roster's count in each group. */
const TARGET = new Map<string, number>();
for (const [position, n] of ACTIVE_ROSTER) {
  const group = NEED_GROUP[position];
  TARGET.set(group, (TARGET.get(group) ?? 0) + n);
}

const healthy = (p: Player): boolean => !cannotPlay(designation(p.injury));

/** Players missing from each group, from the team's players (active and injured reserve count). */
function needsOf(players: readonly Player[]): Map<string, number> {
  const count = new Map<string, number>();
  const well = new Map<string, number>();
  for (const p of players) {
    if (p.status !== 'active' && p.status !== 'ir') continue;
    const group = NEED_GROUP[p.position];
    count.set(group, (count.get(group) ?? 0) + 1);
    if (p.status === 'active' && healthy(p)) well.set(group, (well.get(group) ?? 0) + 1);
  }
  const needs = new Map<string, number>();
  for (const [group, target] of TARGET)
    needs.set(group, Math.max(0, Math.min(target, count.get(group) ?? 0) - (well.get(group) ?? 0)));
  return needs;
}

/**
 * Players missing from each group: the standard roster's count, or the team's own count when it carries
 * fewer (active and injured reserve), less its healthy active players.
 */
export const rosterNeeds = (league: League, abbr: TeamAbbr): Map<string, number> =>
  needsOf(Object.values(league.players).filter(p => p.team === abbr));

/** The weakest of a group, sparing this week's starters while anyone else is left. */
function weakest(league: League, abbr: TeamAbbr, players: readonly Player[]): Player | null {
  const starting = new Set(Object.values(startersOf(league.teams[abbr].depth.order)));
  const bench = players.filter(p => !starting.has(p.id));
  const pool = bench.length ? bench : players;
  return [...pool].sort((a, b) => a.ovr - b.ovr || (a.id < b.id ? -1 : 1))[0] ?? null;
}

/** The general manager's pick among the best free agents in each group (or only one group). */
function decideSigning(
  league: League,
  abbr: TeamAbbr,
  mine: readonly Player[],
  pool: readonly Player[],
  rng: Rng,
  only?: string
) {
  const needs = needsOf(mine.filter(p => p.team === abbr));
  const today = calendarDay(league.date);
  const byGroup = new Map<string, Player[]>();
  for (const p of pool) {
    const group = NEED_GROUP[p.position];
    if (only && group !== only) continue;
    byGroup.set(group, [...(byGroup.get(group) ?? []), p]);
  }
  const option = (p: Player, own: boolean): SigningOption => ({
    id: p.id,
    name: `${fullName(p)} (${p.position}${own ? ', practice squad' : ''})`,
    need: needs.get(NEED_GROUP[p.position]) ?? 0,
    ovr: p.ovr,
    age: ageOn(p.birthDate, today),
    own
  });
  const options: SigningOption[] = [
    ...[...byGroup.values()].flatMap(players =>
      players
        .sort((a, b) => b.ovr - a.ovr || (a.id < b.id ? -1 : 1))
        .slice(0, S.candidatesPerGroup)
        .map(p => option(p, false))
    ),
    ...mine
      .filter(p => p.team === abbr && p.status === 'practice' && (!only || NEED_GROUP[p.position] === only))
      .map(p => option(p, true))
  ];
  return decide(
    'Sign a free agent',
    `${abbr} general manager`,
    options,
    [need(), quality(), youth(), familiar()],
    { need: S.needWeight, quality: 1, youth: S.youthWeight, familiar: 1 },
    competence(staffIn(league, abbr, 'GM'), 'evaluation'),
    rng,
    o => o.name
  );
}

export function rosterMoves(league: League, abbr: TeamAbbr, rng: Rng): DecisionLog[] {
  const logs: DecisionLog[] = [];
  const { active: limit, irMinGames, irReturns } = league.rules.roster;
  // The team's players, kept current as moves add them (released players drop out by team).
  const mine = Object.values(league.players).filter(p => p.team === abbr);
  const active = () => mine.filter(p => p.team === abbr && p.status === 'active');

  for (const p of active()) if ((p.injury?.weeksOut ?? 0) >= irMinGames) placeOnInjuredReserve(league, p);

  // Healed players who have missed the minimum games come back, best first, if they beat the weakest
  // healthy player in their group.
  const healed = mine
    .filter(
      p => p.status === 'ir' && (p.injury?.weeksOut ?? 0) === 0 && gamesOnReserve(league, p) >= irMinGames
    )
    .sort((a, b) => b.ovr - a.ovr || (a.id < b.id ? -1 : 1));
  for (const p of healed) {
    if (irReturnsUsed(league, abbr) >= irReturns) break;
    const roster = active();
    if (roster.length >= limit) {
      const group = NEED_GROUP[p.position];
      const cut = weakest(
        league,
        abbr,
        roster.filter(q => NEED_GROUP[q.position] === group && healthy(q))
      );
      if (!cut || cut.ovr >= p.ovr) continue;
      releasePlayer(league, cut);
    }
    activateFromInjuredReserve(league, p);
  }

  // Free agents, looked up only when the team signs someone.
  let pool: Player[] | null = null;
  const sign = (only?: string): boolean => {
    pool ??= freeAgents(league);
    const decision = decideSigning(league, abbr, mine, pool, rng, only);
    const player = decision ? league.players[decision.chosen.id] : undefined;
    if (!decision || !player) return false;
    if (player.status === 'practice') promoteFromPracticeSquad(league, player);
    else {
      signFreeAgent(league, abbr, player, rng);
      mine.push(player);
      pool = pool.filter(p => p !== player);
    }
    logs.push(decision.log);
    return true;
  };

  while (active().length < limit) if (!sign()) break;

  // Short injuries that leave a group below a lineup's worth: sign someone for the week, making room from
  // the group with the most healthy players over its standard count.
  for (const [group, min] of Object.entries(S.minHealthy)) {
    const inGroup = () => active().filter(p => NEED_GROUP[p.position] === group && healthy(p)).length;
    for (let tries = 0; inGroup() < min && tries < min; tries++) {
      pool ??= freeAgents(league);
      const candidates = [...pool, ...mine.filter(p => p.team === abbr && p.status === 'practice')];
      if (!candidates.some(p => NEED_GROUP[p.position] === group)) break;
      const roster = active();
      if (roster.length >= limit) {
        const surplus = new Map<string, Player[]>();
        for (const p of roster) {
          if (!healthy(p)) continue;
          const g = NEED_GROUP[p.position];
          surplus.set(g, [...(surplus.get(g) ?? []), p]);
        }
        const deepest = [...surplus]
          .filter(([g, players]) => players.length > (S.minHealthy[g] ?? 0))
          .sort(
            ([a, pa], [b, pb]) =>
              pb.length - (TARGET.get(b) ?? 0) - (pa.length - (TARGET.get(a) ?? 0)) || (a < b ? -1 : 1)
          )[0];
        const cut = deepest ? weakest(league, abbr, deepest[1]) : null;
        if (!cut) break;
        releasePlayer(league, cut);
      }
      if (!sign(group)) break;
    }
  }
  return logs;
}
