/** The worker's job table. Later milestones add season sims, calibration runs, and AI batches. */
import { hashWords, stream } from '../engine/rng';
import type { JobHandler } from './protocol';

interface SelfTestPayload {
  seed: number;
  draws: number;
}

export const JOBS: Record<string, JobHandler> = {
  ping: payload => ({ pong: payload }),

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
