/**
 * The weekly loop (spec 4.2): play the week's games, record results, heal injuries and add new ones, then
 * move the calendar on, seeding the playoffs after the last regular-season week and setting each round's
 * games as the one before it finishes (spec 5.3). The Super Bowl crowns a champion and opens the offseason.
 */
import type { ClimateTable } from '../../data/climate';
import type { ScheduledGame } from '../../data/schedule';
import type { Conference, TeamAbbr } from '../../data/teams';
import type { League } from '../league/types';
import type { Phase } from '../model/calendar';
import { advanceLeagueRandom, leagueStream, type AdvanceInput } from '../rng';
import { simLeagueGame } from '../sim';
import type { TeamTotals } from '../sim/stats';
import type { GameResult } from '../sim/types';
import type { GameMeta } from '../stats/record';
import { applyInjuries, healWeek } from './injuries';
import { conferenceRound, superBowl, type Seed } from './playoffs';
import { playoffSchedule } from './schedule';
import { leagueStandings, type GameOutcome } from './state';

/** Playoff phases in order: round 1 is the Wild Card round, the last is the Super Bowl. */
const PLAYOFF_PHASES = [
  'wildCard',
  'divisional',
  'conference',
  'superBowl'
] as const satisfies readonly Phase[];
const CONFERENCES: readonly Conference[] = ['AFC', 'NFC'];

export interface WeekOutcome {
  /** The same league, moved on a week. */
  league: League;
  /** The week's games for history storage (spec 9.3). */
  games: { result: GameResult; meta: GameMeta }[];
}

/** The schedule week the league is in (playoff rounds follow the regular season's weeks), or null. */
export function gameWeek(league: League): number | null {
  const { phase, week } = league.date;
  if (phase === 'regularSeason') return week;
  const round = (PLAYOFF_PHASES as readonly Phase[]).indexOf(phase) + 1;
  return round > 0 ? league.rules.season.weeks + round : null;
}

/** This week's games still to play. */
export function weekGames(league: League): ScheduledGame[] {
  const week = gameWeek(league);
  return week === null ? [] : league.schedule.filter(g => g.week === week && !league.season.results[g.id]);
}

const touchdowns = (t: TeamTotals): number =>
  t.passTd + t.rushTd + t.defIntTd + t.fumbleReturnTd + t.kickReturnTd + t.puntReturnTd;

function outcome(result: GameResult, week: number, playoff: boolean): GameOutcome {
  return {
    id: result.id,
    week,
    home: result.home,
    away: result.away,
    homeScore: result.score.home,
    awayScore: result.score.away,
    homeTd: touchdowns(result.box.home.totals),
    awayTd: touchdowns(result.box.away.totals),
    playoff,
    overtime: result.overtime
  };
}

/** Seeds still alive in a conference: seeded, and without a playoff loss. */
function alive(league: League, conference: Conference): Seed[] {
  const seeds = league.season.seeds?.[conference] ?? [];
  const lost = new Set<TeamAbbr>();
  for (const g of Object.values(league.season.results)) {
    if (!g.playoff) continue;
    lost.add(g.homeScore > g.awayScore ? g.away : g.home);
  }
  return seeds.flatMap((abbr, i) => (lost.has(abbr) ? [] : [{ abbr, seed: i + 1, conference }]));
}

/** Moves the calendar on after a week's games, setting the next playoff round when one is due. */
function moveOn(league: League): void {
  const { phase, week } = league.date;
  const field = league.rules.season.playoffTeamsPerConference;
  if (phase === 'regularSeason' && week < league.rules.season.weeks) {
    league.date = { ...league.date, week: week + 1 };
    return;
  }
  if (phase === 'regularSeason') {
    const standings = leagueStandings(league);
    league.season.seeds = {
      AFC: standings.conferences.find(c => c.conference === 'AFC')?.seeds.map(s => s.abbr) ?? [],
      NFC: standings.conferences.find(c => c.conference === 'NFC')?.seeds.map(s => s.abbr) ?? []
    };
  }
  const round = phase === 'regularSeason' ? 0 : (PLAYOFF_PHASES as readonly Phase[]).indexOf(phase) + 1;
  if (round === PLAYOFF_PHASES.length) {
    // The Super Bowl is over: crown the champion and open the offseason (M10 fills it in).
    const final = Object.values(league.season.results).find(g => g.week === gameWeek(league));
    if (final) league.season.champion = final.homeScore > final.awayScore ? final.home : final.away;
    league.date = { ...league.date, phase: 'staff', week: 1 };
    return;
  }
  const next = round + 1;
  const [afc, nfc] = CONFERENCES.map(c => alive(league, c)) as [Seed[], Seed[]];
  const games =
    next === PLAYOFF_PHASES.length
      ? afc[0] && nfc[0]
        ? [superBowl(afc[0], nfc[0], league.season.season, next)]
        : []
      : [...conferenceRound(afc, next, field), ...conferenceRound(nfc, next, field)];
  league.schedule.push(...playoffSchedule(league, games));
  league.date = { ...league.date, phase: PLAYOFF_PHASES[next - 1] as Phase, week: 1 };
}

/**
 * Plays the league's current week in place (spec 4.2) and moves it on. Each game draws from the league's
 * advance seed, so a fixed-seed league replays the same week exactly.
 */
export function advanceWeek(league: League, climate: ClimateTable | null, input: AdvanceInput): WeekOutcome {
  const week = gameWeek(league);
  if (week === null) throw new Error(`There are no games to play in the ${league.date.phase} phase.`);
  const season = league.season.season;
  const playoff = week > league.rules.season.weeks;
  const results = weekGames(league).map(g => simLeagueGame(league, g.id, climate));
  for (const r of results) league.season.results[r.id] = outcome(r, week, playoff);
  // The week passes for every player, then this week's injuries start their clocks.
  healWeek(league);
  applyInjuries(
    league,
    results.flatMap(r => r.injuries),
    season,
    week,
    leagueStream(league.random, 'injuries', week)
  );
  moveOn(league);
  league.random = advanceLeagueRandom(league.random, input);
  return {
    league,
    games: results.map(result => ({ result, meta: { season, week, kind: playoff ? 'playoffs' : 'regular' } }))
  };
}
