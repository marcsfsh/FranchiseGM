/** The worker's job table. Later milestones add season sims and AI batches. */
import { hashWords, stream, type AdvanceInput } from '../engine/rng';
import { advanceWeek } from '../engine/season/advance';
import { advanceOffseason } from '../engine/season/offseason';
import type { NameData } from '../engine/generate/player';
import type { ClimateTable } from '../data/climate';
import type { RunSample } from '../engine/calibration/metrics';
import type { CalibrationData } from '../engine/calibration/replay';
import { LoopSeason } from '../engine/calibration/loop';
import { finishRun, jobLeague, planJobs, runJob, type RunPlan } from '../engine/calibration/run';
import type { Mode, TargetsFile } from '../engine/calibration/targets';
import { createLeague, type NewLeagueInput } from '../engine/league/create';
import { DEFAULT_RULES } from '../engine/rules/ruleset';
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

  /**
   * Plays the league's current week (spec 4.2): weekly management, the games, injuries, awards, news, and
   * the inbox. Returns everything but the AI decision log, which stays in the worker until M14's viewer.
   */
  advanceWeek: payload => {
    const { league, climate, input } = payload as {
      league: League;
      climate: ClimateTable | null;
      input: AdvanceInput;
    };
    const { decisions: _decisions, ...week } = advanceWeek(league, climate, input);
    return week;
  },

  /**
   * Takes the league one offseason step (spec 4.1). Returns everything but the AI decision log, like a
   * week; a step the user must act on first comes back with `blocked` and the league unchanged.
   */
  advanceOffseason: payload => {
    const { league, names, climate, input } = payload as {
      league: League;
      names: NameData;
      climate: ClimateTable | null;
      input: AdvanceInput;
    };
    const { decisions: _decisions, ...step } = advanceOffseason(league, { names, climate }, input);
    return step;
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
   * A calibration run for the dev menu (spec 23.1): the same seasons as `npm run calibrate`, one at a time,
   * with progress after each replay and each week of a weekly-loop season, and a chance to cancel between
   * them. Returns the report.
   */
  calibrate: async (payload, ctx) => {
    const { data, plan, targets, mode } = payload as {
      data: CalibrationData;
      plan: RunPlan;
      targets: TargetsFile;
      mode: Mode;
    };
    const jobs = planJobs(plan);
    // Progress counts a replay as one step and a weekly-loop season as a step a week.
    const weeks = DEFAULT_RULES.season.weeks;
    const total = jobs.reduce((n, j) => n + (j.kind === 'loop' ? weeks : 1), 0);
    let done = 0;
    const started = performance.now();
    const samples: RunSample[] = [];
    // Replays come league by league, so each replay league is generated once.
    let league: League | null = null;
    let leagueIndex = -1;
    let replays = 0;
    let experiments = 0;
    for (const job of jobs) {
      if (job.kind === 'loop') {
        const season = new LoopSeason(jobLeague(data, plan.seed, job), data.climate);
        for (let week = 1; !season.done; week++) {
          ctx.progress(
            done,
            total,
            `Weekly-loop season ${job.league + 1} of ${plan.loopSeasons}, week ${week}`
          );
          await ctx.checkpoint();
          season.playWeek();
          done++;
        }
        samples.push({ league: job.league, replay: 0, loop: true, facts: season.facts() });
        continue;
      }
      const step =
        job.kind === 'experiment'
          ? `Fit experiment ${++experiments} of ${plan.experiments}`
          : `Season ${++replays} of ${plan.seasons}`;
      ctx.progress(done, total, step);
      await ctx.checkpoint();
      if (!league || leagueIndex !== job.league) {
        league = jobLeague(data, plan.seed, job);
        leagueIndex = job.league;
      }
      samples.push(runJob(data, plan.seed, job, league));
      done++;
    }
    ctx.progress(total, total);
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
