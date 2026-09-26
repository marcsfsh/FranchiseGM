/**
 * Calibration replays (spec 23.1): a generated league plays the 2026 regular season from a seeded stream,
 * and the replay keeps only the facts the metrics need (spec 23.3). Each head coach sets his auto depth
 * chart once, and his staff builds a game plan for every opponent (spec 8.7). Rosters stay as generated: a
 * player hurt for some weeks sits out his team's games in those weeks and his backups play, which stands in
 * for the weekly loop's injured reserve and signings, so every game stays independent of the others (D-17).
 */
import type { ClimateTable } from '../../data/climate';
import { decideDepthChart } from '../ai/decisions/depth-chart';
import { decideGamePlan } from '../ai/decisions/game-plan';
import { decideRotation } from '../ai/decisions/rotation';
import { dressable } from '../roster/rules';
import type { ScheduledGame } from '../../data/schedule';
import { TEAM_ABBRS, type TeamAbbr } from '../../data/team-colors';
import type { NameData } from '../generate/player';
import { createLeague, defaultStartOptions } from '../league/create';
import { orderOf } from '../league/depth';
import type { League } from '../league/types';
import type { Player } from '../model/player';
import type { Position } from '../model/positions';
import { stream, type Rng } from '../rng';
import { simulateGame } from '../sim/game';
import { gameSetup, type TeamSetups } from '../sim/setup';
import { emptyTotals, TEAM_KEYS, type StatKey, type TeamTotals } from '../sim/stats';
import type { GameResult, GameWeather, Side } from '../sim/types';
import { FitExperiment, type FitSample } from './experiment';

export interface CalibrationData {
  names: NameData;
  schedule: readonly ScheduledGame[];
  climate: ClimateTable | null;
}

/** A generated fictional league for calibration with every team's auto depth chart and rotation; the seed picks the league. */
export function calibrationLeague(data: CalibrationData, seed: number): League {
  const league = createLeague({
    id: `calibration-${seed}`,
    name: 'Calibration',
    start: defaultStartOptions(TEAM_ABBRS[0] as TeamAbbr, seed),
    gameVersion: 'calibration',
    names: data.names,
    schedule: data.schedule,
    fixed: true
  });
  for (const abbr of TEAM_ABBRS) {
    const depth = decideDepthChart(
      league,
      abbr,
      dressable(league, abbr),
      stream(seed, 'calibration', 'depth', abbr)
    );
    league.teams[abbr].depth.order = orderOf(depth.starters);
    league.teams[abbr].rotation = decideRotation(
      league,
      abbr,
      dressable(league, abbr),
      depth.starters,
      stream(seed, 'calibration', 'rotation', abbr)
    ).rotation;
  }
  return league;
}

export interface GameFact {
  week: number;
  home: TeamAbbr;
  away: TeamAbbr;
  homeScore: number;
  awayScore: number;
  overtime: boolean;
  /** Neutral and international sites have no home team. */
  neutral: boolean;
  /** The winner trailed at some point in the fourth quarter or overtime. */
  comeback: boolean;
  weather: GameWeather;
  /** Both teams' passing and field goals, for weather effects. */
  passAtt: number;
  passCmp: number;
  fgAtt: number;
  fgMade: number;
}

/** Player-line stats summed by team: special teams, field goals by distance, and targets. */
export const TEAM_LINE_KEYS = [
  'kickoffs', 'kickoffTouchbacks', 'kickReturns', 'kickReturnYds', 'puntReturns', 'puntReturnYds', 'puntYds',
  'puntNetYds', 'fgAtt40', 'fgMade40', 'fgAtt50', 'fgMade50', 'targets', 'receptions'
] as const satisfies readonly StatKey[]; // prettier-ignore
export type TeamLineKey = (typeof TEAM_LINE_KEYS)[number];

export interface TeamInjuries {
  /** Every in-game injury, minor ones included. */
  all: number;
  /** Injuries that cost at least one regular-season game. */
  missed: number;
  gamesLost: number;
  seasonEnding: number;
  /** Player-games sat out at kickoff because of an earlier injury: equal to gamesLost. */
  absences: number;
}

export interface TeamFact {
  team: TeamAbbr;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  totals: TeamTotals;
  lines: Record<TeamLineKey, number>;
  injuries: TeamInjuries;
}

/** Player stats for leaders and usage shares. */
export const PLAYER_KEYS = [
  'passAtt', 'passYds', 'rushAtt', 'rushYds', 'targets', 'receptions', 'recYds', 'sacks', 'defInt'
] as const satisfies readonly StatKey[]; // prettier-ignore
export type PlayerKey = (typeof PLAYER_KEYS)[number];

export interface PlayerFact {
  id: string;
  team: TeamAbbr;
  position: Position;
  line: Record<PlayerKey, number>;
}

export interface ReplayFacts {
  games: GameFact[];
  teams: TeamFact[];
  players: PlayerFact[];
  /** Present for fit experiment replays, whose other facts don't count toward the metrics. */
  fit?: FitSample;
}

export interface ReplayOptions {
  /** Give each starter his best or worst scheme fit at random (spec 7.3, 23.3). */
  fitExperiment?: boolean;
}

/** Whether the winner trailed at some point in the fourth quarter or overtime. */
export function trailedLate(result: Pick<GameResult, 'score' | 'scoring'>): boolean {
  const { home: finalHome, away: finalAway } = result.score;
  if (finalHome === finalAway) return false;
  const behind = (home: number, away: number) => (finalHome > finalAway ? home < away : away < home);
  let home = 0;
  let away = 0;
  for (const s of result.scoring) {
    if (s.quarter >= 4 && behind(home, away)) return true;
    home = s.home;
    away = s.away;
    if (s.quarter >= 4 && behind(home, away)) return true;
  }
  return false;
}

const emptyLines = (): Record<TeamLineKey, number> =>
  Object.fromEntries(TEAM_LINE_KEYS.map(k => [k, 0])) as Record<TeamLineKey, number>;

/**
 * A regular season's facts, collected game by game: the same facts whether the games come from a replay or
 * from the weekly loop.
 */
export class SeasonFacts {
  private readonly teams = new Map<TeamAbbr, TeamFact>();
  private readonly players = new Map<string, PlayerFact>();
  private readonly games: GameFact[] = [];
  /** Each team's game weeks, to count the games an injury costs (bye weeks cost none). */
  private readonly weeks = new Map<TeamAbbr, number[]>();

  constructor(
    private readonly league: League,
    schedule: readonly ScheduledGame[]
  ) {
    for (const g of schedule)
      for (const abbr of [g.home, g.away]) this.weeks.set(abbr, [...(this.weeks.get(abbr) ?? []), g.week]);
  }

  team(abbr: TeamAbbr): TeamFact {
    let fact = this.teams.get(abbr);
    if (!fact) {
      fact = {
        team: abbr,
        wins: 0,
        losses: 0,
        ties: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        totals: emptyTotals(),
        lines: emptyLines(),
        injuries: { all: 0, missed: 0, gamesLost: 0, seasonEnding: 0, absences: 0 }
      };
      this.teams.set(abbr, fact);
    }
    return fact;
  }

  /** Adds a played regular-season game. */
  add(game: ScheduledGame, result: GameResult): void {
    const both = (key: 'passAtt' | 'passCmp' | 'fgAtt' | 'fgMade') =>
      result.box.home.totals[key] + result.box.away.totals[key];
    this.games.push({
      week: game.week,
      home: game.home,
      away: game.away,
      homeScore: result.score.home,
      awayScore: result.score.away,
      overtime: result.overtime,
      neutral: game.siteType !== 'home',
      comeback: trailedLate(result),
      weather: result.weather,
      passAtt: both('passAtt'),
      passCmp: both('passCmp'),
      fgAtt: both('fgAtt'),
      fgMade: both('fgMade')
    });

    for (const side of ['home', 'away'] as const satisfies readonly Side[]) {
      const abbr = result[side];
      const fact = this.team(abbr);
      const scored = result.score[side];
      const allowed = result.score[side === 'home' ? 'away' : 'home'];
      if (scored > allowed) fact.wins++;
      else if (scored < allowed) fact.losses++;
      else fact.ties++;
      fact.pointsFor += scored;
      fact.pointsAgainst += allowed;
      for (const key of TEAM_KEYS) fact.totals[key] += result.box[side].totals[key];
      for (const [id, line] of Object.entries(result.box[side].players)) {
        for (const key of TEAM_LINE_KEYS) fact.lines[key] += line[key];
        if (!PLAYER_KEYS.some(k => line[k] !== 0)) continue;
        let player = this.players.get(id);
        if (!player) {
          player = {
            id,
            team: abbr,
            position: this.league.players[id]?.position ?? 'WR',
            line: Object.fromEntries(PLAYER_KEYS.map(k => [k, 0])) as Record<PlayerKey, number>
          };
          this.players.set(id, player);
        }
        for (const key of PLAYER_KEYS) player.line[key] += line[key];
      }
    }

    for (const injury of result.injuries) {
      const fact = this.team(injury.team).injuries;
      const lost = (this.weeks.get(injury.team) ?? []).filter(
        w => w > game.week && w <= game.week + injury.weeks
      ).length;
      fact.all++;
      if (lost > 0) fact.missed++;
      fact.gamesLost += lost;
      if (injury.severity === 'season') fact.seasonEnding++;
    }
  }

  facts(fit?: FitSample): ReplayFacts {
    return {
      games: this.games,
      teams: [...this.teams.values()],
      players: [...this.players.values()],
      ...(fit ? { fit } : {})
    };
  }
}

/**
 * Plays the league's regular season once from `rng` (spec 23.1). Every game draws its own sub-stream, so
 * a replay is the same whatever order the runner schedules it in.
 */
export function replaySeason(
  league: League,
  climate: ClimateTable | null,
  rng: Rng,
  options: ReplayOptions = {}
): ReplayFacts {
  const schedule = league.schedule.filter(g => g.season === league.date.season);
  const cache: TeamSetups = new Map();
  const experiment = options.fitExperiment ? new FitExperiment(league) : null;
  const facts = new SeasonFacts(league, schedule);
  // Players out with injuries, through the week they return after.
  const outThrough = new Map<string, number>();
  const rosters = new Map<TeamAbbr, Player[]>();
  for (const p of Object.values(league.players))
    if (p.status === 'active' && p.team)
      rosters.set(p.team as TeamAbbr, [...(rosters.get(p.team as TeamAbbr) ?? []), p]);
  // Each team's players out this week, so its cached setup is rebuilt when the list changes.
  const outKey = new Map<TeamAbbr, string>();

  for (const game of [...schedule].sort((a, b) => a.week - b.week || (a.id < b.id ? -1 : 1))) {
    const g = rng.fork('game', game.id);
    // Players out hurt don't dress (spec 12.1): they sit on injured reserve while the teams set up and plan,
    // so their backups dress and the lineup fills around them, as the weekly depth chart does.
    const hurt: Player[] = [];
    for (const abbr of [game.home, game.away]) {
      const out = (rosters.get(abbr) ?? []).filter(p => (outThrough.get(p.id) ?? 0) >= game.week);
      const key = out.map(p => p.id).join();
      if (outKey.get(abbr) !== key) cache.delete(abbr);
      outKey.set(abbr, key);
      facts.team(abbr).injuries.absences += out.length;
      hurt.push(...out);
    }
    for (const p of hurt) p.status = 'ir';
    const setup = gameSetup(league, game, climate, g.fork('setup'), cache);
    setup.home.plan = decideGamePlan(league, game.home, game.away, g.fork('homePlan')).plan;
    setup.away.plan = decideGamePlan(league, game.away, game.home, g.fork('awayPlan')).plan;
    for (const p of hurt) p.status = 'active';
    experiment?.assign(setup, g.fork('arms'));
    const result = simulateGame(setup, g.fork('plays'));
    experiment?.record(setup, result);
    facts.add(game, result);
    for (const injury of result.injuries)
      if (injury.weeks > 0)
        outThrough.set(
          injury.playerId,
          Math.max(outThrough.get(injury.playerId) ?? 0, game.week + injury.weeks)
        );
  }

  return facts.facts(experiment?.sample);
}
