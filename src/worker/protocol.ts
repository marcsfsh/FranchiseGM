/**
 * Message protocol between the UI and the simulation worker (spec 2.3). Jobs report measured progress so
 * the UI can show a real progress bar, and long jobs yield at checkpoints so a cancel can land.
 */

export type ToWorker =
  { kind: 'run'; id: number; job: string; payload: unknown } | { kind: 'cancel'; id: number };

export type FromWorker =
  | { kind: 'progress'; id: number; done: number; total: number; label?: string }
  | { kind: 'result'; id: number; payload: unknown }
  | { kind: 'error'; id: number; message: string; cancelled?: boolean };

export interface JobContext {
  /** Reports measured progress. Messages are thinned to whole-percent changes. */
  progress(done: number, total: number, label?: string): void;
  /** Yields to the message loop and throws CancelledError if the job was cancelled. */
  checkpoint(): Promise<void>;
  readonly cancelled: boolean;
}

export type JobHandler = (payload: unknown, ctx: JobContext) => unknown;

export class CancelledError extends Error {
  constructor() {
    super('Cancelled');
    this.name = 'CancelledError';
  }
}

/** Handles protocol messages with a job table. `yieldNow` lets queued messages (like cancel) arrive. */
export function createJobRunner(
  handlers: Readonly<Record<string, JobHandler>>,
  post: (message: FromWorker) => void,
  yieldNow: () => Promise<void> = () => Promise.resolve()
): (message: ToWorker) => Promise<void> {
  const cancelled = new Set<number>();
  return async message => {
    if (message.kind === 'cancel') {
      cancelled.add(message.id);
      return;
    }
    const { id, job, payload } = message;
    const handler = handlers[job];
    if (!handler) {
      post({ kind: 'error', id, message: `Unknown job: ${job}` });
      return;
    }
    let lastPercent = -1;
    let lastLabel: string | undefined;
    const ctx: JobContext = {
      progress(done, total, label) {
        const percent = total > 0 ? Math.floor((done / total) * 100) : 0;
        // Whole percents only, but a new label (the step in progress) always goes through.
        if (percent === lastPercent && done !== total && label === lastLabel) return;
        lastPercent = percent;
        lastLabel = label;
        post({ kind: 'progress', id, done, total, ...(label === undefined ? {} : { label }) });
      },
      async checkpoint() {
        await yieldNow();
        if (cancelled.has(id)) throw new CancelledError();
      },
      get cancelled() {
        return cancelled.has(id);
      }
    };
    try {
      const result = await handler(payload, ctx);
      post({ kind: 'result', id, payload: result });
    } catch (error) {
      const isCancel = error instanceof CancelledError;
      post({
        kind: 'error',
        id,
        message: error instanceof Error ? error.message : String(error),
        ...(isCancel ? { cancelled: true } : {})
      });
    } finally {
      cancelled.delete(id);
    }
  };
}
