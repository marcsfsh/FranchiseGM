/**
 * Runs engine jobs in the inlined Web Worker and keeps the UI responsive. If the browser refuses the
 * worker, jobs run on the main thread through the same protocol instead of failing.
 */
import GameWorker from '../worker/worker?worker&inline';
import { JOBS } from '../worker/jobs';
import { createJobRunner, type FromWorker, type ToWorker } from '../worker/protocol';

export interface Progress {
  done: number;
  total: number;
  label?: string;
}

interface Pending {
  resolve(value: unknown): void;
  reject(error: Error): void;
  onProgress?: (progress: Progress) => void;
}

export class JobError extends Error {
  constructor(
    message: string,
    readonly cancelled: boolean
  ) {
    super(message);
    this.name = 'JobError';
  }
}

export class WorkerClient {
  readonly mode: 'worker' | 'main-thread';
  private readonly send: (message: ToWorker) => void;
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;

  constructor() {
    let worker: Worker | null;
    try {
      worker = new GameWorker();
    } catch {
      worker = null;
    }
    if (worker) {
      this.mode = 'worker';
      worker.addEventListener('message', (event: MessageEvent<FromWorker>) => this.receive(event.data));
      worker.addEventListener('error', event => {
        for (const [id, job] of this.pending) {
          job.reject(new JobError(event.message || 'The simulation worker stopped', false));
          this.pending.delete(id);
        }
      });
      const w = worker;
      this.send = message => w.postMessage(message);
    } else {
      this.mode = 'main-thread';
      const run = createJobRunner(
        JOBS,
        message => this.receive(message),
        () => new Promise(resolve => window.setTimeout(resolve, 0))
      );
      this.send = message => void run(message);
    }
  }

  /** Starts a job. The promise settles with its result or a JobError. */
  run<T>(
    job: string,
    payload: unknown,
    onProgress?: (progress: Progress) => void
  ): { id: number; result: Promise<T> } {
    const id = this.nextId++;
    const result = new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        ...(onProgress ? { onProgress } : {})
      });
    });
    this.send({ kind: 'run', id, job, payload });
    return { id, result };
  }

  cancel(id: number): void {
    if (this.pending.has(id)) this.send({ kind: 'cancel', id });
  }

  private receive(message: FromWorker): void {
    const job = this.pending.get(message.id);
    if (!job) return;
    if (message.kind === 'progress') {
      job.onProgress?.({
        done: message.done,
        total: message.total,
        ...(message.label ? { label: message.label } : {})
      });
      return;
    }
    this.pending.delete(message.id);
    if (message.kind === 'result') job.resolve(message.payload);
    else job.reject(new JobError(message.message, message.cancelled === true));
  }
}
