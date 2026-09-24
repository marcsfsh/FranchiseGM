import { execSync } from 'node:child_process';

// Layout tests check the real deliverable, so build it first. GM_SKIP_BUILD=1 reuses dist/game.html.
export default function globalSetup(): void {
  if (process.env.GM_SKIP_BUILD === '1') return;
  execSync('npm run build --silent', { stdio: ['ignore', 'ignore', 'inherit'] });
}
