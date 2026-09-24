import { expect, test } from '@playwright/test';
import { openGame } from './helpers';

// Spec 23.4 offline test: the built file makes zero network requests, and the embedded fonts render.
test.describe('offline', () => {
  test('opens from disk with the network off and makes no network requests', async ({
    page,
    context
  }, info) => {
    test.skip(!info.project.name.endsWith('desktop'), 'Once per browser is enough.');
    const requests: string[] = [];
    page.on('request', request => requests.push(request.url()));
    // Any network request fails and is recorded. WebKit's offline emulation also blocks file:// loads,
    // so only Chromium turns the whole network off.
    await context.route(/^(https?|wss?):/, route => route.abort());
    if (info.project.name.startsWith('chromium')) await context.setOffline(true);
    await openGame(page, { theme: 'night' });

    for (const hash of ['#/roster', '#/settings', '#/league', '#/']) {
      await page.evaluate(h => (location.hash = h), hash);
      await expect(page.locator('main h1')).toBeVisible();
    }
    await page.evaluate(async () => {
      const gm = (
        globalThis as unknown as { __gm: { runJob(job: string, payload: unknown): Promise<unknown> } }
      ).__gm;
      await gm.runJob('selfTest', { seed: 1, draws: 1000 });
    });

    const fonts = await page.evaluate(async () => {
      await document.fonts.ready;
      return {
        condensed: document.fonts.check('700 20px "Barlow Condensed"'),
        condensedItalic: document.fonts.check('italic 800 20px "Barlow Condensed"'),
        ui: document.fonts.check('400 16px Overpass'),
        loaded: [...document.fonts]
          .filter(f => f.status === 'loaded')
          .map(f => `${f.family} ${f.style} ${f.weight}`)
      };
    });
    expect(fonts.condensed && fonts.condensedItalic && fonts.ui, JSON.stringify(fonts)).toBe(true);
    expect(fonts.loaded.some(f => f.includes('Barlow Condensed'))).toBe(true);
    expect(fonts.loaded.some(f => f.includes('Overpass'))).toBe(true);

    const external = requests.filter(url => !/^(file|data|blob):/.test(url));
    expect(external).toEqual([]);
  });
});
