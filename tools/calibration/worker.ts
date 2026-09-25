/** Runs replay jobs for the calibration runner, keeping the last generated league for the next job. */
import { parentPort, workerData } from 'node:worker_threads';
import { jobLeague, runJob, type ReplayJob } from '../../src/engine/calibration/run';
import type { League } from '../../src/engine/league/types';
import { loadData } from './data';

const data = loadData();
const { seed } = workerData as { seed: number };
let last: { index: number; league: League } | null = null;

parentPort?.on('message', (job: ReplayJob) => {
  if (last?.index !== job.league) last = { index: job.league, league: jobLeague(data, seed, job.league) };
  parentPort?.postMessage(runJob(data, seed, job, last.league));
});
