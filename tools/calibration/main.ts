/**
 * The calibration runner (spec 23.1). Replays the 2026 season across generated leagues on worker threads,
 * compares every metric with calibration/targets.json, writes Markdown and JSON reports to
 * calibration/reports/, and prints the summary. Exits with 1 when a metric fails.
 *
 *   npm run calibrate -- [--seasons 100] [--per-league 10] [--experiments N] [--seed 1] [--workers N]
 *                        [--ci] [--out calibration/reports]
 *
 * --ci runs the CI subset against its wide bands (spec 23.1: 20 seasons in CI).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { Worker } from 'node:worker_threads';
import type { RunSample } from '../../src/engine/calibration/metrics';
import { reportMarkdown, summaryLines } from '../../src/engine/calibration/report';
import {
  defaultExperiments,
  finishRun,
  planJobs,
  type ReplayJob,
  type RunPlan
} from '../../src/engine/calibration/run';
import { checkTargets, type Mode, type TargetsFile } from '../../src/engine/calibration/targets';

const { values } = parseArgs({
  options: {
    seasons: { type: 'string', default: '100' },
    'per-league': { type: 'string', default: '10' },
    experiments: { type: 'string' },
    seed: { type: 'string', default: '1' },
    workers: { type: 'string' },
    ci: { type: 'boolean', default: false },
    out: { type: 'string', default: 'calibration/reports' }
  }
});

const whole = (name: string, text: string | undefined, min: number): number => {
  const n = Number(text);
  if (!Number.isInteger(n) || n < min) throw new Error(`--${name} needs a whole number of at least ${min}.`);
  return n;
};

const seasons = whole('seasons', values.seasons, 1);
const plan: RunPlan = {
  seed: whole('seed', values.seed, 0),
  seasons,
  perLeague: whole('per-league', values['per-league'], 1),
  experiments:
    values.experiments === undefined
      ? defaultExperiments(seasons)
      : whole('experiments', values.experiments, 0)
};
const mode: Mode = values.ci ? 'ci' : 'full';
const workers = Math.min(
  values.workers === undefined ? Math.min(availableParallelism(), 8) : whole('workers', values.workers, 1),
  planJobs(plan).length
);

const targets = JSON.parse(readFileSync('calibration/targets.json', 'utf8')) as TargetsFile;
const problems = checkTargets(targets);
if (problems.length) throw new Error(`calibration/targets.json:\n${problems.join('\n')}`);

/** Runs every job on a pool of workers; a free worker takes a job from its cached league when it can. */
function runJobs(jobs: readonly ReplayJob[]): Promise<RunSample[]> {
  const pending = [...jobs];
  const samples: RunSample[] = [];
  const take = (league: number | null): ReplayJob | undefined => {
    const at = pending.findIndex(j => j.league === league);
    return pending.splice(at >= 0 ? at : 0, 1)[0];
  };
  return Promise.all(
    Array.from(
      { length: workers },
      () =>
        new Promise<void>((resolve, reject) => {
          const worker = new Worker(new URL('./worker.mjs', import.meta.url), {
            workerData: { seed: plan.seed }
          });
          let league: number | null = null;
          const next = () => {
            const job = take(league);
            if (!job) {
              void worker.terminate().then(() => resolve());
              return;
            }
            league = job.league;
            worker.postMessage(job);
          };
          worker.on('message', (sample: RunSample) => {
            samples.push(sample);
            next();
          });
          worker.on('error', reject);
          next();
        })
    )
  ).then(() => samples);
}

const started = performance.now();
const samples = await runJobs(planJobs(plan));
const seconds = (performance.now() - started) / 1000;
const created = new Date().toISOString().slice(0, 10);
const report = finishRun(plan, samples, targets, mode, created, seconds);

mkdirSync(values.out, { recursive: true });
const base = path.join(values.out, `${created}-${mode}-${plan.seasons}s-seed${plan.seed}`);
writeFileSync(`${base}.md`, reportMarkdown(report));
writeFileSync(`${base}.json`, `${JSON.stringify(report, null, 2)}\n`);
for (const line of summaryLines(report)) console.log(line);
console.log(`Report: ${base}.md (${seconds.toFixed(0)} s on ${workers} workers)`);
if (report.counts.fail > 0) process.exitCode = 1;
