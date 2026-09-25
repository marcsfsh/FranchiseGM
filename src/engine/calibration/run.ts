/**
 * A calibration run (spec 23.1), shared by the command-line runner and the in-app dev menu: the plan of
 * replays, one replay job, and the finished report. Leagues are generated from the run's seed, and each
 * replay draws its own stream, so any worker can run any job and the report is the same.
 */
import type { League } from '../league/types';
import { stream } from '../rng';
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
}

export interface ReplayJob {
  league: number;
  replay: number;
  experiment: boolean;
}

/** Experiment replays by default: a tenth of the run, and at least two. */
export const defaultExperiments = (seasons: number): number => Math.max(2, Math.round(seasons / 10));

export const leagueCount = (plan: Pick<RunPlan, 'seasons' | 'perLeague'>): number =>
  Math.max(1, Math.ceil(plan.seasons / plan.perLeague));

/** Every replay of a run: regular replays league by league, then experiments spread across the leagues. */
export function planJobs(plan: RunPlan): ReplayJob[] {
  const leagues = leagueCount(plan);
  const jobs: ReplayJob[] = [];
  for (let i = 0; i < plan.seasons; i++)
    jobs.push({ league: Math.floor(i / plan.perLeague), replay: i % plan.perLeague, experiment: false });
  for (let e = 0; e < plan.experiments; e++)
    jobs.push({ league: e % leagues, replay: plan.perLeague + Math.floor(e / leagues), experiment: true });
  return jobs;
}

/** The generated league a job plays in. */
export function jobLeague(data: CalibrationData, seed: number, league: number): League {
  return calibrationLeague(data, stream(seed, 'calibration', 'league', league).nextU32());
}

/** Plays one replay. `league` is the job's league, from jobLeague (callers may keep it for later jobs). */
export function runJob(data: CalibrationData, seed: number, job: ReplayJob, league: League): RunSample {
  const rng = stream(seed, 'calibration', 'replay', job.league, job.replay);
  return {
    league: job.league,
    replay: job.replay,
    facts: replaySeason(league, data.climate, rng, { fitExperiment: job.experiment })
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
    experiments: plan.experiments
  };
  return buildReport(settings, evaluate(computeMetrics(ordered), targets, mode), created, seconds);
}
