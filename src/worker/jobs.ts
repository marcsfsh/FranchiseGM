/** The worker's job table. Later milestones add season sims and AI batches. */
import { hashWords, stream } from '../engine/rng';
import type { ClimateTable } from '../data/climate';
import type { RunSample } from '../engine/calibration/metrics';
import type { CalibrationData } from '../engine/calibration/replay';
import { finishRun, jobLeague, planJobs, runJob, type RunPlan } from '../engine/calibration/run';
import type { Mode, TargetsFile } from '../engine/calibration/targets';
import { createLeague, type NewLeagueInput } from '../engine/league/create';
import type { League } from '../engine/league/types';
import { simLeagueGame } from '../engine/sim';
import type { JobHandler } from './protocol';

interface SelfTestPayload {
  seed: number;
  draws: number;
}

export const JOBS: Record<string, JobHandler> = {
  ping: payload => ({ pong: payload }),

  /** Generates a new league (spec 3.2). Progress counts teams. */
  createLeague: (payload, ctx) => {
    const input = payload as Omit<NewLeagueInput, 'onProgress'>;
    return createLeague({
      ...input,
      onProgress: (done, total) => ctx.progress(done, total, 'Building teams')
    });
  },

  /** Simulates one scheduled game (spec 8) and reports how long the sim took. */
  simGame: payload => {
    const { league, gameId, climate } = payload as {
      league: League;
      gameId: string;
      climate: ClimateTable | null;
    };
    const started = performance.now();
    const result = simLeagueGame(league, gameId, climate);
    return { result, ms: performance.now() - started };
  },

  /**
   * A calibration run for the dev menu (spec 23.1): the same replays as `npm run calibrate`, one at a time,
   * with progress after each and a chance to cancel between them. Returns the report.
   */
  calibrate: async (payload, ctx) => {
    const { data, plan, targets, mode } = payload as {
      data: CalibrationData;
      plan: RunPlan;
      targets: TargetsFile;
      mode: Mode;
    };
    const jobs = planJobs(plan);
    const started = performance.now();
    const samples: RunSample[] = [];
    // Jobs come league by league, so each league is generated once.
    let league: League | null = null;
    let leagueIndex = -1;
    for (const [i, job] of jobs.entries()) {
      const step = job.experiment
        ? `Fit experiment ${i - plan.seasons + 1} of ${plan.experiments}`
        : `Season ${i + 1} of ${plan.seasons}`;
      ctx.progress(i, jobs.length, step);
      await ctx.checkpoint();
      if (!league || leagueIndex !== job.league) {
        league = jobLeague(data, plan.seed, job.league);
        leagueIndex = job.league;
      }
      samples.push(runJob(data, plan.seed, job, league));
    }
    ctx.progress(jobs.length, jobs.length);
    const created = new Date().toISOString().slice(0, 10);
    return finishRun(plan, samples, targets, mode, created, (performance.now() - started) / 1000);
  },

  /** Draws from a seeded stream in chunks, reporting progress. Proves the worker and the PRNG work. */
  selfTest: async (payload, ctx) => {
    const { seed, draws } = payload as SelfTestPayload;
    const rng = stream(seed, 'selfTest');
    const chunk = Math.max(1, Math.ceil(draws / 20));
    let checksum = 0;
    for (let done = 0; done < draws;) {
      const end = Math.min(draws, done + chunk);
      for (; done < end; done++) checksum = hashWords([checksum, rng.nextU32()]);
      ctx.progress(done, draws);
      await ctx.checkpoint();
    }
    return { checksum };
  }
};
