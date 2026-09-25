/** A calibration worker thread: loads the TypeScript engine, then runs replay jobs from the main thread. */
import { register } from 'tsx/esm/api';

register();
await import('./worker.ts');
