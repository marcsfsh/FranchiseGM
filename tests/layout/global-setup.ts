import { execSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';

/** A league export with three seasons of history (tools/make-history-fixture.ts). */
export const HISTORY_FIXTURE = 'test-results/fixtures/history-league.json.gz';

// Layout tests check the real deliverable, so build it first. GM_SKIP_BUILD=1 reuses dist/game.html and an
// existing history fixture.
export default function globalSetup(): void {
  const skip = process.env.GM_SKIP_BUILD === '1';
  if (!skip) execSync('npm run build --silent', { stdio: ['ignore', 'ignore', 'inherit'] });
  if (skip && existsSync(HISTORY_FIXTURE)) return;
  mkdirSync('test-results/fixtures', { recursive: true });
  execSync(`npx tsx tools/make-history-fixture.ts ${HISTORY_FIXTURE} 3`, {
    stdio: ['ignore', 'ignore', 'inherit']
  });
}
