/**
 * Rookies around the draft: the draft order (spec 10.4), the cap space teams keep for their draft classes,
 * and signing a rookie to his first contract.
 */
import { TEAM_ABBRS, type TeamAbbr } from '../../data/team-colors';
import { capHit } from '../contracts/cap';
import { rookieContract } from '../contracts/build';
import { activeRoster } from '../league/transactions';
import type { League } from '../league/types';
import { leagueYear } from '../model/calendar';
import { pickJersey } from '../model/jerseys';
import type { Player } from '../model/player';
import type { Rng } from '../rng';
import { minimumSalary } from '../rules/ruleset';
import { PLAYOFF_PHASES, leagueStandings } from '../season/state';
import { winPct } from '../season/standings';
import { TUNING } from '../tuning';

const O = TUNING.offseason;

/**
 * The draft order (spec 10.4): teams out of the playoffs by record, worst first, then playoff teams by the
 * round they went out in, the champion last; a weaker schedule breaks ties.
 */
export function draftOrder(league: League): TeamAbbr[] {
  const records = leagueStandings(league).table.records;
  const weeks = league.rules.season.weeks;
  const reached = new Map<TeamAbbr, number>();
  for (const g of Object.values(league.season.results)) {
    if (!g.playoff) continue;
    for (const t of [g.home, g.away]) reached.set(t, Math.max(reached.get(t) ?? 0, g.week - weeks));
  }
  const champion = league.season.champion;
  if (champion) reached.set(champion, PLAYOFF_PHASES.length + 1);
  return [...TEAM_ABBRS].sort(
    (a, b) =>
      (reached.get(a) ?? 0) - (reached.get(b) ?? 0) ||
      winPct(records[a].overall) - winPct(records[b].overall) ||
      records[a].sos - records[b].sos ||
      (a < b ? -1 : 1)
  );
}

/**
 * Cap space a team keeps through free agency for its draft class: the rookie deals of the picks it holds in
 * this league year's draft, and its undrafted rookies at the minimum. A pick not yet numbered is placed by
 * `order`.
 */
export function rookieReserve(league: League, abbr: TeamAbbr, order: readonly TeamAbbr[] = draftOrder(league)): number {
  const year = leagueYear(league.date);
  let total = O.udfaPerTeam * minimumSalary(league.rules, 0);
  for (const p of league.picks)
    if (p.year === year && p.owner === abbr && !p.playerId) {
      const number = p.number ?? (p.round - 1) * order.length + order.indexOf(p.original) + 1;
      total += capHit(rookieContract(league.rules, { id: 'reserve', playerId: '', team: abbr }, year, number), year, league.rules);
    }
  return total;
} // prettier-ignore

/** A spot on the team's roster: a jersey number nobody there wears. */
function jerseyFor(league: League, player: Player, team: TeamAbbr, rng: Rng): number {
  const taken = new Set(activeRoster(league, team).map(p => p.jersey));
  return pickJersey(player.position, taken, t => rng.float() * t) ?? 0;
}

/** Signs a rookie to a team on his first contract. */
export function signRookie(
  league: League,
  player: Player,
  team: TeamAbbr,
  contractId: string,
  rng: Rng
): void {
  player.jersey = jerseyFor(league, player, team, rng);
  Object.assign(player, { team, status: 'active', contractId });
}
