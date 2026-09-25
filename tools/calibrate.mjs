/**
 * The calibration runner (spec 23.1): `npm run calibrate -- --seasons N`. Loads the TypeScript engine and
 * hands over to tools/calibration/main.ts, which prints only the summary and writes the full report to
 * calibration/reports/.
 */
import { register } from 'tsx/esm/api';

register();
await import('./calibration/main.ts');
