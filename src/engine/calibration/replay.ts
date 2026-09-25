/**
 * Calibration replays (spec 23.1): a generated league plays the 2026 regular season from a seeded stream,
 * and the replay keeps only the facts the metrics need (spec 23.3). Until the offseason (M10) and the season
 * loop (M7) exist, rosters stay as generated and depth charts don't change; a player hurt for some weeks
 * sits out his team's games in those weeks and his backups play, which stands in for M7's weekly injury
 * updates (D-17).
 */
import type { ClimateTable } from '../../data/climate';
import type { ScheduledGame } from '../../data/schedule';
import { TEAM_ABBRS, type TeamAbbr } from '../../data/team-colors';
import type { NameData } from '../generate/player';
import { createLeague, defaultStartOptions } from '../league/create';
import type { League } from '../league/types';
import type { Position } from '../model/positions';
import type { Rng } from '../rng';
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

/** A generated fictional league for calibration; the seed picks the league. */
export function calibrationLeague(data: CalibrationData, seed: number): League {
  return createLeague({
    id: `calibration-${seed}`,
    name: 'Calibration',
    start: defaultStartOptions(TEAM_ABBRS[0] as TeamAbbr, seed),
    gameVersion: 'calibration',
    names: data.names,
    schedule: data.schedule,
    fixed: true
  });
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
  const teams = new Map<TeamAbbr, TeamFact>();
  const players = new Map<string, PlayerFact>();
  const games: GameFact[] = [];
  // Each team's game weeks, to count the games an injury costs (bye weeks cost none).
  const weeks = new Map<TeamAbbr, number[]>();
  for (const g of schedule)
    for (const abbr of [g.home, g.away]) weeks.set(abbr, [...(weeks.get(abbr) ?? []), g.week]);
  // Players out with injuries, through the week they return after.
  const outThrough = new Map<string, number>();
  const team = (abbr: TeamAbbr): TeamFact => {
    let fact = teams.get(abbr);
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
      teams.set(abbr, fact);
    }
    return fact;
  };

  for (const game of [...schedule].sort((a, b) => a.week - b.week || (a.id < b.id ? -1 : 1))) {
    const g = rng.fork('game', game.id);
    const setup = gameSetup(league, game, climate, g.fork('setup'), cache);
    for (const side of ['home', 'away'] as const)
      for (const player of Object.values(setup[side].players))
        if ((outThrough.get(player.id) ?? 0) >= game.week) {
          player.out = true;
          team(setup[side].abbr).injuries.absences++;
        }
    experiment?.assign(setup, g.fork('arms'));
    const result = simulateGame(setup, g.fork('plays'));
    experiment?.record(setup, result);

    const both = (key: 'passAtt' | 'passCmp' | 'fgAtt' | 'fgMade') =>
      result.box.home.totals[key] + result.box.away.totals[key];
    games.push({
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
      const fact = team(abbr);
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
        let player = players.get(id);
        if (!player) {
          player = {
            id,
            team: abbr,
            position: league.players[id]?.position ?? 'WR',
            line: Object.fromEntries(PLAYER_KEYS.map(k => [k, 0])) as Record<PlayerKey, number>
          };
          players.set(id, player);
        }
        for (const key of PLAYER_KEYS) player.line[key] += line[key];
      }
    }

    for (const injury of result.injuries) {
      const fact = team(injury.team).injuries;
      const lost = (weeks.get(injury.team) ?? []).filter(
        w => w > game.week && w <= game.week + injury.weeks
      ).length;
      fact.all++;
      if (injury.weeks > 0)
        outThrough.set(
          injury.playerId,
          Math.max(outThrough.get(injury.playerId) ?? 0, game.week + injury.weeks)
        );
      if (lost > 0) fact.missed++;
      fact.gamesLost += lost;
      if (injury.severity === 'season') fact.seasonEnding++;
    }
  }

  return {
    games,
    teams: [...teams.values()],
    players: [...players.values()],
    ...(experiment ? { fit: experiment.sample } : {})
  };
}
