/** Runs season jobs for the calibration runner, keeping the last replay league for the next job. */
import { parentPort, workerData } from 'node:worker_threads';
import { jobLeague, runJob, sharedLeague, type RunJob } from '../../src/engine/calibration/run';
import type { League } from '../../src/engine/league/types';
import { loadData } from './data';

const data = loadData();
const { seed, chainSeasons } = workerData as { seed: number; chainSeasons: number };
let last: { index: number; league: League } | null = null;

parentPort?.on('message', (job: RunJob) => {
  const shared = sharedLeague(job);
  let league: League;
  if (shared === null) league = jobLeague(data, seed, job);
  else {
    if (last?.index !== shared) last = { index: shared, league: jobLeague(data, seed, job) };
    league = last.league;
  }
  parentPort?.postMessage(runJob(data, seed, job, league, chainSeasons));
});
