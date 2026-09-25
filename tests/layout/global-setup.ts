import { exec, execSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { promisify } from 'node:util';

/** A league export with three seasons of history (tools/make-history-fixture.ts). */
export const HISTORY_FIXTURE = 'test-results/fixtures/history-league.json.gz';
/** The 2026 season six weeks in, with its games in history (tools/make-season-fixture.ts). */
export const SEASON_FIXTURE = 'test-results/fixtures/season-week6.json.gz';
export const SEASON_FIXTURE_NAME = 'Season fixture';
/** The 2026 season played through the Super Bowl. */
export const FINISHED_FIXTURE = 'test-results/fixtures/season-done.json.gz';
export const FINISHED_FIXTURE_NAME = 'Finished season';

const run = promisify(exec);

// Layout tests check the real deliverable, so build it first. GM_SKIP_BUILD=1 reuses dist/game.html and
// existing fixtures.
export default async function globalSetup(): Promise<void> {
  const skip = process.env.GM_SKIP_BUILD === '1';
  if (!skip) execSync('npm run build --silent', { stdio: ['ignore', 'ignore', 'inherit'] });
  mkdirSync('test-results/fixtures', { recursive: true });
  const fixtures: [string, string][] = [
    [HISTORY_FIXTURE, `npx tsx tools/make-history-fixture.ts ${HISTORY_FIXTURE} 3`],
    [SEASON_FIXTURE, `npx tsx tools/make-season-fixture.ts ${SEASON_FIXTURE} 6 "${SEASON_FIXTURE_NAME}"`],
    [
      FINISHED_FIXTURE,
      `npx tsx tools/make-season-fixture.ts ${FINISHED_FIXTURE} all "${FINISHED_FIXTURE_NAME}"`
    ]
  ];
  await Promise.all(
    fixtures.filter(([file]) => !(skip && existsSync(file))).map(([, command]) => run(command))
  );
}
