/** Web Worker entry. The build inlines this file and starts it from a blob URL (spec 2.3). */
import { JOBS } from './jobs';
import { createJobRunner, type FromWorker, type ToWorker } from './protocol';

interface WorkerScope {
  postMessage(message: FromWorker): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<ToWorker>) => void): void;
}

const scope = self as unknown as WorkerScope;
const run = createJobRunner(
  JOBS,
  message => scope.postMessage(message),
  () => new Promise(resolve => setTimeout(resolve, 0))
);
scope.addEventListener('message', event => void run(event.data));
