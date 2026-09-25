import { expect, test } from '@playwright/test';
import { openGame } from './helpers';

// M1 done-when: the base database embeds in game.html and loads at startup in under 1 second on desktop.
test('the embedded base database loads at startup in under a second', async ({ page }, info) => {
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
  expect(info2.ms).toBeLessThan(1000);
});
