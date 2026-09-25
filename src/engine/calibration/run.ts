/**
 * A calibration run (spec 23.1), shared by the command-line runner and the in-app dev menu: the plan of
 * seasons, one season's job, and the finished report. A run has two modes. Replays play the 2026 season
 * many times over in a few generated leagues, with rosters as generated; weekly-loop seasons play it through
 * advanceWeek, as the game does, one generated league each, so AI roster moves, injured reserve, waivers,
 * and practice squad elevations happen. Leagues are generated from the run's seed and each season draws
 * its own stream, so any worker can run any job and the report is the same.
 */
import type { League } from '../league/types';
import { stream } from '../rng';
import { LoopSeason, loopLeague } from './loop';
import { computeMetrics, type RunSample } from './metrics';
import { calibrationLeague, replaySeason, type CalibrationData } from './replay';
import { buildReport, type CalibrationReport, type RunSettings } from './report';
import { evaluate, type Mode, type TargetsFile } from './targets';

export interface RunPlan {
  seed: number;
  /** Regular replays. */
  seasons: number;
  /** Replays per generated league; each league's team ratings are fitted over its replays. */
  perLeague: number;
  /** Fit experiment replays. */
  experiments: number;
  /** Seasons played through the weekly loop, each in a league of its own. */
  loopSeasons: number;
}

export interface RunJob {
  kind: 'replay' | 'experiment' | 'loop';
  /** The generated league: a replay league, or a loop season's own league. */
  league: number;
  /** The replay's number in its league; 0 for a loop season. */
  replay: number;
}

/** Experiment replays by default: a tenth of the run, and at least two. */
export const defaultExperiments = (seasons: number): number => Math.max(2, Math.round(seasons / 10));

export const leagueCount = (plan: Pick<RunPlan, 'seasons' | 'perLeague'>): number =>
  Math.max(1, Math.ceil(plan.seasons / plan.perLeague));

/**
 * Every job of a run: weekly-loop seasons first (the longest jobs, so the workers finish together), then
 * regular replays league by league, then experiments spread across the leagues.
 */
export function planJobs(plan: RunPlan): RunJob[] {
  const leagues = leagueCount(plan);
  const jobs: RunJob[] = [];
  for (let i = 0; i < plan.loopSeasons; i++) jobs.push({ kind: 'loop', league: i, replay: 0 });
  for (let i = 0; i < plan.seasons; i++)
    jobs.push({ kind: 'replay', league: Math.floor(i / plan.perLeague), replay: i % plan.perLeague });
  for (let e = 0; e < plan.experiments; e++)
    jobs.push({
      kind: 'experiment',
      league: e % leagues,
      replay: plan.perLeague + Math.floor(e / leagues)
    });
  return jobs;
}

/**
 * The replay league a job shares with other jobs, which a runner may keep between them; null for a loop
 * season, whose league is played through and used once.
 */
export const sharedLeague = (job: RunJob): number | null => (job.kind === 'loop' ? null : job.league);

/** The generated league a job plays in. */
export function jobLeague(data: CalibrationData, seed: number, job: RunJob): League {
  return job.kind === 'loop'
    ? loopLeague(data, stream(seed, 'calibration', 'loop', job.league).nextU32())
    : calibrationLeague(data, stream(seed, 'calibration', 'league', job.league).nextU32());
}

/**
 * Plays one job's season. `league` is the job's league, from jobLeague: a replay leaves it as it was, so
 * callers may keep it for the league's later replays; a loop season plays it through.
 */
export function runJob(data: CalibrationData, seed: number, job: RunJob, league: League): RunSample {
  if (job.kind === 'loop') {
    const season = new LoopSeason(league, data.climate);
    while (!season.done) season.playWeek();
    return { league: job.league, replay: 0, loop: true, facts: season.facts() };
  }
  const rng = stream(seed, 'calibration', 'replay', job.league, job.replay);
  return {
    league: job.league,
    replay: job.replay,
    facts: replaySeason(league, data.climate, rng, { fitExperiment: job.kind === 'experiment' })
  };
}

/** The report for a finished run. `created` and `seconds` come from the caller's clock. */
export function finishRun(
  plan: RunPlan,
  samples: readonly RunSample[],
  targets: TargetsFile,
  mode: Mode,
  created: string,
  seconds: number
): CalibrationReport {
  // Samples arrive in any order; sort them so the metrics add up the same way every time.
  const ordered = [...samples].sort((a, b) => a.league - b.league || a.replay - b.replay);
  const settings: RunSettings = {
    mode,
    seed: plan.seed,
    seasons: plan.seasons,
    leagues: leagueCount(plan),
    perLeague: plan.perLeague,
    experiments: plan.experiments,
    loopSeasons: plan.loopSeasons
  };
  const replays = computeMetrics(ordered.filter(s => !s.loop));
  const loop = computeMetrics(ordered.filter(s => s.loop));
  return buildReport(settings, evaluate({ replays, loop }, targets, mode), created, seconds);
}
