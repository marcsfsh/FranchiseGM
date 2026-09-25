/**
 * Training camp and the preseason (spec 4.1): position battles for the last starting spot at each
 * position, camp injuries, and three weeks of games that don't count, with each team's projected starters
 * resting. Camp's development comes from src/engine/progression/develop.ts (D-30).
 */
import type { ClimateTable } from '../../data/climate';
import type { ScheduledGame } from '../../data/schedule';
import { homeStadium } from '../../data/teams';
import { TEAM_ABBRS, type TeamAbbr } from '../../data/team-colors';
import type { League } from '../league/types';
import { calendarDay } from '../model/calendar';
import type { Player } from '../model/player';
import type { Position } from '../model/positions';
import { changeRatings, type RatingChange } from '../progression/change';
import { keyRatings } from '../progression/training';
import type { Rng } from '../rng';
import { BODY_PARTS } from '../sim/game';
import { gameSetup, simulateGame } from '../sim';
import type { GameResult, InjuryEvent } from '../sim/types';
import type { GameMeta } from '../stats/record';
import { TUNING } from '../tuning';

const C = TUNING.camp;

/** A team's healthy active players at each position, best first. */
function byPosition(league: League, abbr: TeamAbbr): Map<Position, Player[]> {
  const groups = new Map<Position, Player[]>();
  for (const p of Object.values(league.players)) {
    if (p.team !== abbr || p.status !== 'active' || (p.injury?.weeksOut ?? 0) > 0) continue;
    groups.set(p.position, [...(groups.get(p.position) ?? []), p]);
  }
  for (const list of groups.values()) list.sort((a, b) => b.ovr - a.ovr || (a.id < b.id ? -1 : 1));
  return groups;
}

export interface Battle {
  team: TeamAbbr;
  position: Position;
  winner: Player;
  loser: Player;
  /** The backup won the job. */
  upset: boolean;
  change: RatingChange | null;
}

/**
 * Position battles (spec 4.1): where the last starter at a position and the best backup are within
 * `battleGap` overall points, they compete through camp. The backup wins with `battleOdds` less
 * `battleEdge` for each point he trails by; the winner takes the first-team snaps, which add
 * `battleBump` to each of his position's `battleRatings` most important ratings.
 */
export function positionBattles(league: League, rng: Rng): Battle[] {
  const battles: Battle[] = [];
  for (const abbr of TEAM_ABBRS) {
    const teamRng = rng.fork(abbr);
    for (const [position, list] of byPosition(league, abbr)) {
      const starters = C.starters[position];
      const holder = list[starters - 1];
      const challenger = list[starters];
      if (!starters || !holder || !challenger || holder.ovr - challenger.ovr > C.battleGap) continue;
      const upset = teamRng.chance(Math.max(0, C.battleOdds - C.battleEdge * (holder.ovr - challenger.ovr)));
      const [winner, loser] = upset ? [challenger, holder] : [holder, challenger];
      const deltas = Object.fromEntries(keyRatings(position).slice(0, C.battleRatings).map(k => [k, C.battleBump]));
      const before = winner.ovr;
      const change = changeRatings(winner, deltas, 'camp', league.date, [{ id: 'battle', amount: 0 }]);
      if (change) change.drivers = [{ id: 'battle', amount: winner.ovr - before }];
      battles.push({ team: abbr, position, winner, loser, upset, change });
    }
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
 * Each team's projected starters, who rest through the preseason: the best at each position up to its
 * starters, leaving at least that many to play it.
 */
export function restingStarters(league: League): Set<string> {
  const resting = new Set<string>();
  for (const abbr of TEAM_ABBRS)
    for (const [position, list] of byPosition(league, abbr)) {
      const n = Math.min(C.starters[position], list.length - C.starters[position]);
      for (const p of list.slice(0, Math.max(0, n))) resting.add(p.id);
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
