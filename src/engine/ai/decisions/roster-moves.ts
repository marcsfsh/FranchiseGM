/**
 * In-season roster moves for AI teams (spec 12.1, 14.11), made through the same checked transactions as
 * the user's: a roster over the limit (after a waiver claim) cuts its weakest player, players out at least
 * the minimum go to injured reserve, healed ones return while the team has returns left, and the general
 * manager signs free agents at their asking price, or promotes from the practice squad, where the roster is
 * thinnest and the cap allows. A group that short injuries leave below a lineup's worth elevates a
 * practice squad player for the week, or signs someone while the deepest group makes room; the practice
 * squad refills with young free agents. Waiver claims go to AI teams that need the player or would start
 * him over their weakest at his position.
 */
import { TEAM_ABBRS, type TeamAbbr } from '../../../data/team-colors';
import { askingSalary } from '../../contracts/acceptance';
import { ACTIVE_ROSTER } from '../../generate/league';
import { freeAgents, gamesOnReserve, irReturnsUsed } from '../../league/transactions';
import type { League } from '../../league/types';
import { calendarDay } from '../../model/calendar';
import { ageOn, fullName, type Player } from '../../model/player';
import type { Position } from '../../model/positions';
import type { Rng } from '../../rng';
import { makeMove, type Move } from '../../roster/moves';
import { activeLimit, elevatedThisWeek } from '../../roster/rules';
import type { WaiverEntry } from '../../roster/waivers';
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

/** Each group in words, for the reasons roster moves give. */
const GROUP_WORDS: Record<string, string> = {
  QB: 'quarterback', RB: 'running back', FB: 'fullback', WR: 'receiver', TE: 'tight end', OT: 'tackle',
  OG: 'guard', C: 'center', DE: 'defensive end', DT: 'defensive tackle', OLB: 'outside linebacker',
  MLB: 'middle linebacker', CB: 'cornerback', S: 'safety', K: 'kicker', P: 'punter', LS: 'long snapper'
}; // prettier-ignore
const groupWords = (p: Player): string => GROUP_WORDS[NEED_GROUP[p.position]] ?? p.position;
const injuryWords = (p: Player): string =>
  p.injury ? `a ${p.injury.bodyPart} injury, out ${p.injury.weeksOut} weeks` : 'an injury';

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

const JOINED: ReadonlySet<string> = new Set(['activated', 'reserveReturn', 'claimed', 'signed', 'promoted']);

/**
 * The weakest of a group by overall, never a player who joined the active roster this week (the team
 * brought him in on purpose, and last week's depth chart doesn't list him yet).
 */
function weakest(league: League, abbr: TeamAbbr, players: readonly Player[]): Player | null {
  const { season, phase, week } = league.date;
  const joined = new Set(
    league.season.transactions
      .filter(t => t.team === abbr && JOINED.has(t.kind) && t.season === season && t.phase === phase && t.week === week)
      .map(t => t.playerId)
  );
  return [...players].filter(p => !joined.has(p.id)).sort((a, b) => a.ovr - b.ovr || (a.id < b.id ? -1 : 1))[0] ?? null;
} // prettier-ignore

/**
 * The general manager's pick among the best free agents in each group (or only one group), and his own
 * practice squad. Only players who can play this week are considered: the signing fills a hole now.
 */
function decideSigning(
  league: League,
  abbr: TeamAbbr,
  mine: readonly Player[],
  pool: readonly Player[],
  rng: Rng,
  skip: ReadonlySet<string>,
  only?: string
) {
  const needs = needsOf(mine.filter(p => p.team === abbr));
  const today = calendarDay(league.date);
  const byGroup = new Map<string, Player[]>();
  for (const p of pool) {
    if (skip.has(p.id) || !healthy(p)) continue;
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
      .filter(
        p =>
          p.team === abbr &&
          p.status === 'practice' &&
          !skip.has(p.id) &&
          healthy(p) &&
          (!only || NEED_GROUP[p.position] === only)
      )
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

/** A move with the team left out, for a team making its own moves. */
type TeamMove = Move extends infer M ? (M extends Move ? Omit<M, 'team'> : never) : never;

/** The team's weakest healthy player in the group with the most to spare over its standard count. */
function surplusCut(league: League, abbr: TeamAbbr, roster: readonly Player[]): Player | null {
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
  return deepest ? weakest(league, abbr, deepest[1]) : null;
}

export function rosterMoves(league: League, abbr: TeamAbbr, rng: Rng): DecisionLog[] {
  const logs: DecisionLog[] = [];
  const limit = activeLimit(league);
  const { irMinGames } = league.rules.roster;
  // The team's players, found once and again after each move that goes through (a refused move changes
  // nothing).
  let players: Player[] | null = null;
  const mine = () => (players ??= Object.values(league.players).filter(p => p.team === abbr));
  const active = () => mine().filter(p => p.status === 'active');
  const move = (m: TeamMove): boolean => {
    const done = makeMove(league, { ...m, team: abbr } as Move, rng).ok;
    if (done) players = null;
    return done;
  };

  // Over the limit after a waiver claim: cut the weakest player at the claimed player's position group
  // (the claim was an upgrade there), or from the deepest group.
  const { season, phase, week } = league.date;
  const claimed = league.season.transactions
    .filter(
      t =>
        t.team === abbr && t.kind === 'claimed' && t.season === season && t.phase === phase && t.week === week
    )
    .map(t => t.playerId);
  for (let n = active().length; n > limit; n--) {
    const group = claimed.map(id => league.players[id]).find(p => p?.team === abbr)?.position;
    const same = group
      ? active().filter(p => NEED_GROUP[p.position] === NEED_GROUP[group] && !claimed.includes(p.id) && healthy(p))
      : [];
    const cut = (same.length ? weakest(league, abbr, same) : null) ?? surplusCut(league, abbr, active());
    if (!cut || !move({ kind: 'release', playerId: cut.id, reason: 'to make room for a waiver claim' })) break;
  } // prettier-ignore

  for (const p of active())
    if ((p.injury?.weeksOut ?? 0) >= irMinGames)
      move({ kind: 'injuredReserve', playerId: p.id, reason: injuryWords(p) });

  // Healed players who have missed the minimum games come back, best first, if they beat the weakest
  // healthy player in their group. With nobody healthy in the group he's needed, and the room comes from
  // the deepest group instead.
  const healed = mine()
    .filter(
      p => p.status === 'ir' && (p.injury?.weeksOut ?? 0) === 0 && gamesOnReserve(league, p) >= irMinGames
    )
    .sort((a, b) => b.ovr - a.ovr || (a.id < b.id ? -1 : 1));
  for (const p of healed) {
    // A return uses one of the season's designated returns (spec 12.1): with none left, nobody is cut.
    if (irReturnsUsed(league, abbr) >= league.rules.roster.irReturns) break;
    if (active().length >= limit) {
      const group = NEED_GROUP[p.position];
      const inGroup = active().filter(q => NEED_GROUP[q.position] === group && healthy(q));
      const cut = inGroup.length ? weakest(league, abbr, inGroup) : surplusCut(league, abbr, active());
      if (!cut || (inGroup.length > 0 && cut.ovr >= p.ovr)) continue;
      if (
        !move({
          kind: 'release',
          playerId: cut.id,
          reason: `to make room for ${fullName(p)}, back from injured reserve`
        })
      )
        continue;
    }
    if (!move({ kind: 'activate', playerId: p.id, reason: 'healed' })) break;
  }

  // Free agents, looked up only when the team signs someone; players it couldn't sign are skipped.
  let pool: Player[] | null = null;
  const skip = new Set<string>();
  const sign = (only?: string): boolean => {
    pool ??= freeAgents(league);
    for (let tries = 0; tries < S.signingTries; tries++) {
      const decision = decideSigning(league, abbr, mine(), pool, rng, skip, only);
      const player = decision ? league.players[decision.chosen.id] : undefined;
      if (!decision || !player) return false;
      const reason = `needed at ${groupWords(player)}`;
      const done =
        player.status === 'practice'
          ? move({ kind: 'promote', playerId: player.id, reason })
          : move({
              kind: 'sign',
              playerId: player.id,
              offer: { years: 1, salary: askingSalary(league, player), signingBonus: 0 },
              reason
            });
      skip.add(player.id);
      if (done) {
        logs.push(decision.log);
        return true;
      }
    }
    return false;
  };

  while (active().length < limit) if (!sign()) break;

  // Short injuries that leave a group below a lineup's worth: elevate a practice squad player for the game,
  // or sign someone, making room from the group with the most healthy players over its standard count.
  for (const [group, min] of Object.entries(S.minHealthy)) {
    const inGroup = () => active().filter(p => NEED_GROUP[p.position] === group && healthy(p)).length;
    const elevated = () =>
      elevatedThisWeek(league, abbr).filter(id => {
        const p = league.players[id];
        return p !== undefined && NEED_GROUP[p.position] === group;
      }).length;
    for (let tries = 0; inGroup() + elevated() < min && tries < min; tries++) {
      const squad = mine()
        .filter(p => p.status === 'practice' && NEED_GROUP[p.position] === group && healthy(p))
        .sort((a, b) => b.ovr - a.ovr || (a.id < b.id ? -1 : 1));
      if (squad.some(p => move({ kind: 'elevate', playerId: p.id, reason: `short at ${groupWords(p)} this week` }))) continue;
      pool ??= freeAgents(league);
      if (!pool.some(p => NEED_GROUP[p.position] === group && !skip.has(p.id))) break;
      if (active().length >= limit) {
        const cut = surplusCut(league, abbr, active());
        if (!cut || !move({ kind: 'release', playerId: cut.id, reason: 'to make room for a signing' })) break;
      }
      if (!sign(group)) break;
    }
  } // prettier-ignore

  // The practice squad refills with the young free agents with the most upside.
  const today = calendarDay(league.date);
  const young = (pool ??= freeAgents(league))
    .filter(
      p => !skip.has(p.id) && p.status === 'freeAgent' && ageOn(p.birthDate, today) <= S.practiceSquadAge
    )
    .sort((a, b) => b.potential - a.potential || b.ovr - a.ovr || (a.id < b.id ? -1 : 1));
  for (const p of young) {
    if (mine().filter(q => q.status === 'practice').length >= league.rules.roster.practiceSquad) break;
    move({ kind: 'signPracticeSquad', playerId: p.id, reason: 'to fill the practice squad' });
  }
  return logs;
}

/**
 * AI waiver claims (spec 12.1): an AI team claims a player who beats its weakest healthy player at his
 * position group by `claimMargin` points; a full roster cuts that weakest player before the next game.
 * Teams short at a group sign free agents instead, which costs no one a roster spot.
 */
export function waiverClaims(league: League, entry: WaiverEntry, player: Player): TeamAbbr[] {
  // The user's team claims for itself unless its roster management is on auto (spec 22.7).
  const user = league.settings.auto.roster ? null : league.meta.start.userTeam;
  const group = NEED_GROUP[player.position];
  return TEAM_ABBRS.filter(abbr => {
    if (abbr === user || abbr === entry.from) return false;
    const inGroup = Object.values(league.players).filter(
      p => p.team === abbr && p.status === 'active' && NEED_GROUP[p.position] === group && healthy(p)
    );
    return inGroup.length > 0 && player.ovr >= Math.min(...inGroup.map(p => p.ovr)) + S.claimMargin;
  });
}
