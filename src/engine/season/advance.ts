/**
 * The weekly loop (spec 4.2): play the week's games, record results, heal injuries and add new ones, then
 * move the calendar on, seeding the playoffs after the last regular-season week and setting each round's
 * games as the one before it finishes (spec 5.3). The Super Bowl crowns a champion and opens the offseason.
 */
import type { ClimateTable } from '../../data/climate';
import type { DecisionLog } from '../ai/framework';
import { manageWeek } from '../ai/weekly';
import type { Conference, TeamAbbr } from '../../data/teams';
import type { League } from '../league/types';
import type { Phase } from '../model/calendar';
import { advanceLeagueRandom, leagueStream, stream, type AdvanceInput } from '../rng';
import { simLeagueGame } from '../sim';
import type { TeamTotals } from '../sim/stats';
import type { GameResult } from '../sim/types';
import type { GameMeta } from '../stats/record';
import { playersOfTheWeek, type WeeklyAward } from './awards';
import { addToInbox, pausing, weekInbox, type InboxItem } from './inbox';
import { applyInjuries, healWeek } from './injuries';
import { addToTotals, weekNews, type NewsItem } from './news';
import { conferenceRound, superBowl, type Seed } from './playoffs';
import { playoffSchedule } from './schedule';
import { gameWeek, leagueStandings, PLAYOFF_PHASES, weekGames, type GameOutcome } from './state';

export { gameWeek, weekGames } from './state';

const CONFERENCES: readonly Conference[] = ['AFC', 'NFC'];

export interface WeekOutcome {
  /** The same league, moved on a week. */
  league: League;
  /** The week's games for history storage (spec 9.3). */
  games: { result: GameResult; meta: GameMeta }[];
  /** Every AI decision made before the games (spec 14.10), for the debug log. */
  decisions: DecisionLog[];
  /** The week's news, players of the week, and the user's new messages (spec 18.1, 18.4, 19.6). */
  news: NewsItem[];
  awards: WeeklyAward[];
  inbox: InboxItem[];
  /** New messages that stop a multi-week advance under the user's pause settings. */
  pauses: InboxItem[];
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
 * Plays the league's current week in place (spec 4.2) and moves it on: weekly management first, then the
 * games. Each game draws from the league's advance seed, so a fixed-seed league replays the same week
 * exactly.
 */
export function advanceWeek(league: League, climate: ClimateTable | null, input: AdvanceInput): WeekOutcome {
  const week = gameWeek(league);
  if (week === null) throw new Error(`There are no games to play in the ${league.date.phase} phase.`);
  const season = league.season.season;
  const playoff = week > league.rules.season.weeks;
  // Teams set their rosters, lineups, and game plans before kickoff (spec 14.10).
  const movesBefore = league.season.transactions.length;
  const decisions = manageWeek(
    league,
    leagueStream(league.random, 'ai', week),
    stream(league.random.baseSeed, 'ai', season)
  );
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
  // Season totals and players of the week, then the calendar moves on (seeds come after week 18).
  const before = league.season.totals;
  league.season.totals = addToTotals(before, results);
  // Players of the week are a regular-season award.
  const awards = playoff ? [] : playersOfTheWeek(season, week, results);
  league.season.awards.push(...awards);
  moveOn(league);
  // News and the inbox (spec 18.1, 19.6).
  const moves = league.season.transactions.slice(movesBefore);
  const news = weekNews(
    league,
    { week, results, awards, before, after: league.season.totals, moves },
    leagueStream(league.random, 'news', week)
  );
  league.season.news.push(...news);
  const inbox = weekInbox(league, { week, results, awards, news });
  league.inbox = addToInbox(league.inbox, inbox);
  league.random = advanceLeagueRandom(league.random, input);
  return {
    league,
    games: results.map(result => ({
      result,
      meta: { season, week, kind: playoff ? 'playoffs' : 'regular' }
    })),
    decisions,
    news,
    awards,
    inbox,
    pauses: pausing(inbox, league.settings.pause)
  };
}
