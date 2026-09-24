import { defineConfig, devices } from '@playwright/test';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

// Layout tests run against the built dist/game.html from disk (spec 23.4). WebKit runs wherever it's
// installed; CI sets GM_REQUIRE_WEBKIT=1 so a missing WebKit fails there instead of being skipped.
const browsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(homedir(), '.cache', 'ms-playwright');
const hasWebkit =
  process.env.GM_REQUIRE_WEBKIT === '1' ||
  (existsSync(browsersPath) && readdirSync(browsersPath).some(dir => dir.startsWith('webkit-')));
if (!hasWebkit && process.env.TEST_WORKER_INDEX === undefined)
  console.log('WebKit is not installed here, so layout tests run in Chromium only.');

export const SIZES = {
  phone: { width: 390, height: 844 },
  tablet: { width: 834, height: 1194 },
  desktop: { width: 1440, height: 900 }
} as const;

const browsers = [
  { name: 'chromium', device: devices['Desktop Chrome'] },
  ...(hasWebkit ? [{ name: 'webkit', device: devices['Desktop Safari'] }] : [])
];

export default defineConfig({
  testDir: 'tests/layout',
  globalSetup: './tests/layout/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 2 : 4,
  reporter: 'line',
  use: { trace: 'off', screenshot: 'off' },
  projects: browsers.flatMap(({ name, device }) =>
    Object.entries(SIZES).map(([size, viewport]) => ({
      name: `${name}-${size}`,
      use: { ...device, viewport, deviceScaleFactor: 1 },
      metadata: { size }
    }))
  )
});
