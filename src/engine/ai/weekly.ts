/**
 * Weekly management (spec 14.10 cadence, 14.11 in season). Before each week's games every AI team makes
 * its roster moves, decides its questionable players, and sets its depth chart; then every team that
 * plays builds a game plan for its opponent, reading the opponent's new depth chart. The user's team gets
 * the lineup decisions while its depth chart is on auto and a plan while its game plan is on auto; its
 * roster moves are the user's unless roster management is on auto (spec 22.7).
 */
import { TEAM_ABBRS, type TeamAbbr } from '../../data/team-colors';
import { orderOf } from '../league/depth';
import type { League } from '../league/types';
import type { Player } from '../model/player';
import type { Rng } from '../rng';
import { isElevated } from '../roster/rules';
import { cannotPlay, designation } from '../season/injuries';
import { gameWeek, weekGames } from '../season/state';
import { decideDepthChart } from './decisions/depth-chart';
import { decideGamePlan } from './decisions/game-plan';
import { decideRest } from './decisions/rest';
import { decideRotation } from './decisions/rotation';
import { rosterMoves } from './decisions/roster-moves';
import type { DecisionLog } from './framework';

/**
 * Players who can dress this week before any rest decision: active or elevated from the practice squad,
 * and not held out by an injury.
 */
export const dressable = (league: League, abbr: TeamAbbr): Player[] =>
  Object.values(league.players).filter(
    p =>
      p.team === abbr &&
      (p.status === 'active' || isElevated(league, p)) &&
      !cannotPlay(designation(p.injury))
  );

/**
 * `rng` is this week's stream; `seasonRng` is the same every week of a season, for depth charts (see
 * decideDepthChart).
 */
export function manageWeek(league: League, rng: Rng, seasonRng: Rng): DecisionLog[] {
  const week = gameWeek(league);
  if (week === null) return [];
  const playoff = week > league.rules.season.weeks;
  const games = weekGames(league);
  const opponents = new Map<TeamAbbr, TeamAbbr>();
  for (const g of games) {
    opponents.set(g.home, g.away);
    opponents.set(g.away, g.home);
  }
  const user = league.meta.start.userTeam;
  // One stream per team, drawn in a fixed order, so one team's choices never shift another's.
  const streams = new Map(TEAM_ABBRS.map(abbr => [abbr, rng.fork(abbr)] as const));
  const seasonStreams = new Map(TEAM_ABBRS.map(abbr => [abbr, seasonRng.fork(abbr)] as const));
  const logs: DecisionLog[] = [];

  for (const abbr of TEAM_ABBRS) {
    const team = league.teams[abbr];
    const teamRng = streams.get(abbr) as Rng;
    if (abbr !== user || league.settings.auto.roster)
      logs.push(...rosterMoves(league, abbr, teamRng.fork('roster')));
    const auto = abbr !== user || team.depth.auto;
    if (!opponents.has(abbr)) continue;
    const roster = dressable(league, abbr);
    if (auto) {
      const rest = decideRest(league, abbr, roster, playoff, teamRng.fork('rest'));
      team.resting = rest.resting;
      logs.push(...rest.logs);
    } else {
      // The user's calls stand, for players still questionable.
      team.resting = team.resting.filter(
        id => designation(league.players[id]?.injury ?? null) === 'questionable'
      );
    }
    if (auto) {
      const playing = roster.filter(p => !team.resting.includes(p.id));
      const depth = decideDepthChart(league, abbr, playing, seasonStreams.get(abbr) as Rng);
      team.depth.order = orderOf(depth.starters);
      logs.push(...depth.logs);
      const rotation = decideRotation(league, abbr, playing, depth.starters, teamRng.fork('rotation'));
      team.rotation = rotation.rotation;
      logs.push(...rotation.logs);
    }
  }

  for (const [abbr, opponent] of opponents) {
    const team = league.teams[abbr];
    if (abbr === user && !team.plan.auto) continue;
    const choice = decideGamePlan(league, abbr, opponent, (streams.get(abbr) as Rng).fork('plan'));
    team.plan.plan = choice.plan;
    logs.push(...choice.logs);
  }
  return logs;
}
