import { expect, test } from '@playwright/test';
import { openGame } from './helpers';

// M1: the base database embeds in game.html and loads at startup. The load time is measured for milestone
// reports, never enforced (post-M23 section 2.18).
test('the embedded base database loads at startup', async ({ page }, info) => {
  test.skip(!info.project.name.endsWith('desktop'), 'Desktop timing only.');
  await openGame(page);
  await expect(page.locator('html')).toHaveAttribute('data-base-db', 'ready');
  const info2 = await page.evaluate(() => {
    const gm = (
      globalThis as unknown as {
        __gm: { baseDbReadyMs: number; baseDbInfo: { games: number; season: number } };
      }
    ).__gm;
    return { ms: gm.baseDbReadyMs, ...gm.baseDbInfo };
  });
  expect(info2.games).toBe(272);
  expect(info2.season).toBe(2026);
  console.log(`Measured: the base database is ready ${Math.round(info2.ms)} ms after startup.`);
});
