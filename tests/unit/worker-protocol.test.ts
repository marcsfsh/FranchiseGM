import { describe, expect, it } from 'vitest';
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
