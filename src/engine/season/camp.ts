/**
 * Training camp and the preseason (spec 4.1): the depth charts for the rosters as they stand, position
 * battles for the starting jobs on them, camp injuries, and three weeks of games that don't count, with each
 * team's starters resting. Camp's development comes from src/engine/progression/develop.ts (D-30).
 */
import type { ClimateTable } from '../../data/climate';
import type { ScheduledGame } from '../../data/schedule';
import { homeStadium } from '../../data/teams';
import { TEAM_ABBRS, type TeamAbbr } from '../../data/team-colors';
import { decideDepthChart } from '../ai/decisions/depth-chart';
import type { DecisionLog } from '../ai/framework';
import { dressable } from '../roster/rules';
import { recipeFor, roleRating } from '../fit/role-rating';
import { orderOf } from '../league/depth';
import { leagueFitContext } from '../league/fit';
import type { League } from '../league/types';
import { calendarDay } from '../model/calendar';
import type { Player } from '../model/player';
import { changeRatings, type RatingChange } from '../progression/change';
import { keyRatings } from '../progression/training';
import type { Rng } from '../rng';
import { DEFENSE_SLOTS, OFFENSE_SLOTS, type Slot } from '../schemes/slots';
import { BODY_PARTS } from '../sim/game';
import { gameSetup, simulateGame } from '../sim';
import { depthChart } from '../sim/setup';
import type { GameResult, InjuryEvent } from '../sim/types';
import type { GameMeta } from '../stats/record';
import { TUNING } from '../tuning';

const C = TUNING.camp;
const SLOTS: readonly Slot[] = [...OFFENSE_SLOTS, ...DEFENSE_SLOTS];

/**
 * Sets every depth chart on auto for the rosters as they stand, as the coming season's first week would
 * set it: pass that season's AI stream, so each team draws from the same fork as its weekly management
 * (spec 12.2).
 */
export function setDepthCharts(league: League, seasonRng: Rng): DecisionLog[] {
  const user = league.meta.start.userTeam;
  const logs: DecisionLog[] = [];
  for (const abbr of TEAM_ABBRS) {
    const team = league.teams[abbr];
    if (abbr === user && !team.depth.auto) continue;
    const depth = decideDepthChart(league, abbr, dressable(league, abbr), seasonRng.fork(abbr));
    team.depth.order = orderOf(depth.starters);
    logs.push(...depth.logs);
  }
  return logs;
}

/** A team's starting offense and defense as a game would field them: its depth chart, filled out by role. */
function fieldedStarters(
  league: League,
  abbr: TeamAbbr,
  roster: readonly Player[]
): Partial<Record<Slot, string>> {
  const depth = depthChart(roster, leagueFitContext(league, abbr), {}, league.teams[abbr].depth.order);
  const starters: Partial<Record<Slot, string>> = {};
  for (const slot of SLOTS) {
    const id = depth[slot]?.[0];
    if (id) starters[slot] = id;
  }
  return starters;
}

export interface Battle {
  team: TeamAbbr;
  slot: Slot;
  winner: Player;
  loser: Player;
  /** The challenger won the job. */
  upset: boolean;
  change: RatingChange | null;
}

/**
 * Position battles (spec 4.1) for the starting jobs on each depth chart: at every slot where the best
 * player not starting anywhere is within `battleGap` role rating points of the starter, they compete
 * through camp. The challenger wins at `battleOdds` less `battleEdge` for each point he trails by (more when
 * he's ahead). The winner takes the first-team snaps, which add `battleBump` to his position's
 * `battleRatings` most important ratings, and the job: an auto chart starts him from then on, and the
 * weekly charts keep him for his incumbency. The user's own chart is theirs to change. `teams` narrows the
 * camps held, for tests.
 */
export function positionBattles(league: League, rng: Rng, teams: readonly TeamAbbr[] = TEAM_ABBRS): Battle[] {
  const user = league.meta.start.userTeam;
  const battles: Battle[] = [];
  for (const abbr of teams) {
    const teamRng = rng.fork(abbr);
    const team = league.teams[abbr];
    const roster = dressable(league, abbr);
    const starters = fieldedStarters(league, abbr, roster);
    const starting = new Set(Object.values(starters));
    const ctx = leagueFitContext(league, abbr);
    for (const slot of SLOTS) {
      const holder = starters[slot] ? league.players[starters[slot] as string] : undefined;
      if (!holder) continue;
      const eligible = recipeFor(ctx, slot).eligible;
      const rating = (p: Player) => roleRating(p, slot, ctx).rating;
      const challenger = roster
        .filter(p => !starting.has(p.id) && eligible.includes(p.position))
        .sort((a, b) => rating(b) - rating(a) || (a.id < b.id ? -1 : 1))[0];
      const gap = challenger ? rating(holder) - rating(challenger) : Infinity;
      if (!challenger || gap > C.battleGap) continue;
      const upset = teamRng.chance(Math.min(1, Math.max(0, C.battleOdds - C.battleEdge * gap)));
      const [winner, loser] = upset ? [challenger, holder] : [holder, challenger];
      const deltas = Object.fromEntries(keyRatings(winner.position).slice(0, C.battleRatings).map(k => [k, C.battleBump]));
      const before = winner.ovr;
      const change = changeRatings(winner, deltas, 'camp', league.date);
      if (change) change.drivers = [{ id: 'battle', amount: winner.ovr - before }];
      if (upset) {
        starters[slot] = challenger.id;
        starting.delete(holder.id);
        starting.add(challenger.id);
      }
      battles.push({ team: abbr, slot, winner, loser, upset, change });
    }
    if (abbr !== user || team.depth.auto) team.depth.order = orderOf(starters);
  }
  return battles;
} // prettier-ignore

/**
 * Camp injuries (spec 4.1, 10.8): each player on a team's active roster can be hurt at camp, at
 * `injuryRate` times the in-game proneness from his injury and toughness ratings and the injury frequency
 * slider. Camp injuries cost weeks, so the severities are the in-game ones past minor.
 */
export function campInjuries(league: League, rng: Rng): InjuryEvent[] {
  const K = TUNING.sim.calls;
  const g = league.settings.sim.general;
  const weights = TUNING.sim.injurySeverity.slice(1).map(w => w * g.injurySeverity);
  const severities = ['short', 'medium', 'season'] as const;
  const events: InjuryEvent[] = [];
  if (!weights.some(w => w > 0)) return events;
  const players = Object.values(league.players)
    .filter(p => p.team && p.status === 'active' && !p.injury)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const p of players) {
    const risk =
      C.injuryRate *
      (K.injuryProne - p.ratings.inj / 99) *
      (K.toughnessBase - p.ratings.tgh / K.toughnessScale) *
      g.injuryFrequency;
    if (!rng.chance(risk)) continue;
    const severity = severities[rng.weightedIndex(weights)] ?? 'short';
    const [low, high] = K.injuryWeeks[severity];
    const parts = BODY_PARTS[severity];
    events.push({
      playerId: p.id,
      team: p.team as TeamAbbr,
      quarter: 0,
      severity,
      weeks: rng.int(low, high),
      bodyPart: rng.pick(parts)
    });
  }
  return events;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pairKey = (a: TeamAbbr, b: TeamAbbr): string => (a < b ? `${a}-${b}` : `${b}-${a}`);

/** A preseason game's ID, apart from the regular season's: "2027-P1-NE-SEA". */
export const preseasonId = (season: number, week: number, away: TeamAbbr, home: TeamAbbr): string =>
  `${season}-P${week}-${away}-${home}`;

/**
 * The preseason schedule for the season after `offseason`: each team plays once a week, never the same
 * team twice, and hosts once or twice (the one with fewer home games so far hosts, a coin flip on ties).
 */
export function preseasonSchedule(offseason: number, weeks: number, rng: Rng): ScheduledGame[] {
  const season = offseason + 1;
  const met = new Set<string>();
  const hosted = new Map<TeamAbbr, number>(TEAM_ABBRS.map(t => [t, 0]));
  const games: ScheduledGame[] = [];
  for (let week = 1; week <= weeks; week++) {
    let pairs: [TeamAbbr, TeamAbbr][] | null = null;
    for (let tries = 0; !pairs && tries < C.pairingTries; tries++) pairs = pairUp(rng.shuffle([...TEAM_ABBRS]), met);
    if (!pairs) throw new Error(`No preseason pairings for week ${week}.`);
    const date = calendarDay({ season: offseason, phase: 'preseason', week });
    for (const [a, b] of pairs) {
      met.add(pairKey(a, b));
      const ha = hosted.get(a) ?? 0;
      const hb = hosted.get(b) ?? 0;
      const [home, away] = ha < hb || (ha === hb && rng.chance(0.5)) ? [a, b] : [b, a];
      hosted.set(home, (hosted.get(home) ?? 0) + 1);
      games.push({ id: preseasonId(season, week, away, home), season, week, day: WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()] ?? 'Sat', date, timeEt: C.kickoff, away, home, siteType: 'home', venue: homeStadium(home).id });
    }
  }
  return games;
} // prettier-ignore

/** Pairs teams in order, each with the next one it hasn't met; null when the order leaves a team unpaired. */
function pairUp(order: TeamAbbr[], met: ReadonlySet<string>): [TeamAbbr, TeamAbbr][] | null {
  const pairs: [TeamAbbr, TeamAbbr][] = [];
  const left = [...order];
  while (left.length) {
    const a = left.shift() as TeamAbbr;
    const i = left.findIndex(b => !met.has(pairKey(a, b)));
    if (i < 0) return null;
    pairs.push([a, left.splice(i, 1)[0] as TeamAbbr]);
  }
  return pairs;
}

/**
 * Each team's starters, who rest through the preseason: every starter the team would field who has a
 * healthy player at his position not starting, so the backups can field the lineup.
 */
export function restingStarters(league: League): Set<string> {
  const resting = new Set<string>();
  for (const abbr of TEAM_ABBRS) {
    const roster = dressable(league, abbr);
    const starting = new Set(Object.values(fieldedStarters(league, abbr, roster)));
    for (const id of starting) {
      const starter = league.players[id];
      if (starter && roster.some(p => !starting.has(p.id) && p.position === starter.position))
        resting.add(id);
    }
  }
  return resting;
}

/** A preseason week's games, with the starters resting; their lines are kept as preseason (spec 9.1). */
export function playPreseasonWeek(
  league: League,
  week: number,
  climate: ClimateTable | null,
  rng: Rng
): { result: GameResult; meta: GameMeta }[] {
  const resting = restingStarters(league);
  return (league.preseason?.games ?? [])
    .filter(g => g.week === week)
    .map(g => {
      const gameRng = rng.fork(g.id);
      const setup = gameSetup(league, g, climate, gameRng.fork('setup'), undefined, resting);
      return { result: simulateGame(setup, gameRng.fork('plays')), meta: { season: g.season, week, kind: 'preseason' } };
    }); // prettier-ignore
}
