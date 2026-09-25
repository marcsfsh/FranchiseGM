import { describe, expect, it } from 'vitest';
import type { CalibrationReport } from '../../src/engine/calibration/report';
import type { TargetsFile } from '../../src/engine/calibration/targets';
import { JOBS } from '../../src/worker/jobs';
import { createJobRunner, type FromWorker } from '../../src/worker/protocol';

const collect = () => {
  const messages: FromWorker[] = [];
  return { messages, post: (m: FromWorker) => void messages.push(m) };
};

describe('worker job protocol', () => {
  it('runs a job, reports whole-percent progress, and returns the result', async () => {
    const { messages, post } = collect();
    const run = createJobRunner(JOBS, post);
    await run({ kind: 'run', id: 1, job: 'selfTest', payload: { seed: 9, draws: 1000 } });
    const progress = messages.filter(m => m.kind === 'progress');
    expect(progress.length).toBeGreaterThan(5);
    expect(progress.length).toBeLessThanOrEqual(101);
    expect(progress.at(-1)).toMatchObject({ done: 1000, total: 1000 });
    const result = messages.at(-1);
    expect(result).toMatchObject({ kind: 'result', id: 1 });
    // Same seed, same checksum.
    const again = collect();
    await createJobRunner(
      JOBS,
      again.post
    )({ kind: 'run', id: 2, job: 'selfTest', payload: { seed: 9, draws: 1000 } });
    expect(again.messages.at(-1)).toMatchObject({
      kind: 'result',
      payload: (result as { payload: unknown }).payload
    });
  });

  it('reports unknown jobs and thrown errors', async () => {
    const { messages, post } = collect();
    const run = createJobRunner(
      {
        boom: () => {
          throw new Error('bad input');
        }
      },
      post
    );
    await run({ kind: 'run', id: 3, job: 'nope', payload: null });
    await run({ kind: 'run', id: 4, job: 'boom', payload: null });
    expect(messages).toEqual([
      { kind: 'error', id: 3, message: 'Unknown job: nope' },
      { kind: 'error', id: 4, message: 'bad input' }
    ]);
  });

  it('cancels a job at its next checkpoint', async () => {
    const { messages, post } = collect();
    let release: () => void = () => undefined;
    const gate = new Promise<void>(resolve => (release = resolve));
    const run = createJobRunner(JOBS, post, () => gate);
    const running = run({ kind: 'run', id: 5, job: 'selfTest', payload: { seed: 1, draws: 100 } });
    await run({ kind: 'cancel', id: 5 });
    release();
    await running;
    expect(messages.at(-1)).toEqual({ kind: 'error', id: 5, message: 'Cancelled', cancelled: true });
  });

  it('echoes a ping', async () => {
    const { messages, post } = collect();
    await createJobRunner(JOBS, post)({ kind: 'run', id: 6, job: 'ping', payload: 'hi' });
    expect(messages).toEqual([{ kind: 'result', id: 6, payload: { pong: 'hi' } }]);
  });
});

describe('createLeague job', () => {
  it('builds a league and reports progress by team', async () => {
    const { readFileSync } = await import('node:fs');
    const { parseSchedule } = await import('../../src/data/schedule');
    const { defaultStartOptions } = await import('../../src/engine/league/create');
    const { nameData } = await import('../helpers/base-data');
    const { messages, post } = collect();
    await createJobRunner(
      JOBS,
      post
    )({
      kind: 'run',
      id: 9,
      job: 'createLeague',
      payload: {
        id: 'l1',
        name: 'Worker league',
        start: defaultStartOptions('GB', 3),
        gameVersion: 'test',
        names: nameData(),
        schedule: parseSchedule(readFileSync('data-raw/schedule-2026.csv', 'utf8'), 2026)
      }
    });
    const progress = messages.filter(m => m.kind === 'progress');
    expect(progress.at(-1)).toMatchObject({ done: 32, total: 32, label: 'Building teams' });
    const result = messages.at(-1) as { kind: string; payload: { meta: { name: string } } };
    expect(result.kind).toBe('result');
    expect(result.payload.meta.name).toBe('Worker league');
  });
});

describe('calibrate job', () => {
  it('replays a plan step by step and returns the same report as replaying it directly', async () => {
    const { readFileSync } = await import('node:fs');
    const { parseClimate } = await import('../../src/data/climate');
    const { parseSchedule } = await import('../../src/data/schedule');
    const { finishRun, jobLeague, planJobs, runJob } = await import('../../src/engine/calibration/run');
    const { nameData } = await import('../helpers/base-data');
    // The first two weeks keep replays quick.
    const data = {
      names: nameData(),
      schedule: parseSchedule(readFileSync('data-raw/schedule-2026.csv', 'utf8'), 2026).filter(
        g => g.week <= 2
      ),
      climate: parseClimate(readFileSync('data-raw/climate.csv', 'utf8'))
    };
    const targets = JSON.parse(readFileSync('calibration/targets.json', 'utf8')) as TargetsFile;
    const plan = { seed: 4, seasons: 1, perLeague: 10, experiments: 1 };
    const { messages, post } = collect();
    await createJobRunner(
      JOBS,
      post
    )({ kind: 'run', id: 10, job: 'calibrate', payload: { data, plan, targets, mode: 'full' } });
    const labels = messages.flatMap(m => (m.kind === 'progress' ? [m.label] : []));
    expect(labels).toEqual(['Season 1 of 1', 'Fit experiment 1 of 1', undefined]);
    const result = messages.at(-1) as { kind: string; payload: CalibrationReport };
    expect(result.kind).toBe('result');
    const league = jobLeague(data, plan.seed, 0);
    const samples = planJobs(plan).map(job => runJob(data, plan.seed, job, league));
    const { created, seconds } = result.payload;
    expect(result.payload).toEqual(finishRun(plan, samples, targets, 'full', created, seconds));
  });
});
