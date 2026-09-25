/** The worker's job table. Later milestones add season sims, calibration runs, and AI batches. */
import { hashWords, stream } from '../engine/rng';
import type { ClimateTable } from '../data/climate';
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
