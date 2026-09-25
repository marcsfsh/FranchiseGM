import { expect, test, type Page } from '@playwright/test';
import { contrastOf, expectNoHorizontalOverflow, expectTouchTargets, openGame, sizeOf } from './helpers';

// M6: the hidden developer tools and the in-app calibration runner (spec 23.1, 23.5).

async function openDevTools(page: Page, theme: 'day' | 'night' = 'day'): Promise<void> {
  await openGame(page, { hash: '#/settings', theme });
  const version = page.getByRole('button', { name: /^Franchise GM version/ });
  for (let i = 0; i < 7; i++) await version.click();
  await page.getByRole('link', { name: 'Open developer tools' }).click();
  await expect(page.locator('main h1')).toHaveText('Developer tools');
}

/** Report groups fit their width: no table or row reaches past its group. */
async function expectReportFits(page: Page): Promise<void> {
  const wide = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('main .metric-region')]
      .filter(region => region.scrollWidth > region.clientWidth + 1)
      .map(
        region => `${region.querySelector('h4')?.textContent}: ${region.scrollWidth} in ${region.clientWidth}`
      )
  );
  expect(wide, 'report groups wider than their space').toEqual([]);
}

test('keeps developer tools hidden until the version number is tapped seven times', async ({ page }) => {
  await openGame(page, { hash: '#/dev' });
  await expect(page.locator('main')).toContainText('Developer tools are hidden');
  await page.goto(page.url().replace('#/dev', '#/settings'));
  await expect(page.locator('main h1')).toHaveText('Settings');
  await expect(page.getByRole('link', { name: 'Open developer tools' })).toHaveCount(0);
  const version = page.getByRole('button', { name: /^Franchise GM version/ });
  for (let i = 0; i < 6; i++) await version.click();
  await expect(page.getByRole('link', { name: 'Open developer tools' })).toHaveCount(0);
  await version.click();
  await expect(page.getByRole('link', { name: 'Open developer tools' })).toBeVisible();
});

test('runs a calibration in the worker and shows the report, in Night', async ({ page }, info) => {
  test.setTimeout(180_000);
  await openDevTools(page, 'night');
  await expect(page.locator('main .empty')).toContainText('No report yet');

  // A bad season count is caught before anything runs.
  await page.fill('#calSeasons', '0');
  await page.getByRole('button', { name: 'Run calibration' }).click();
  await expect(page.locator('#calSeasons-error')).toBeVisible();
  await expect(page.locator('#calSeasons')).toBeFocused();

  // Run by keyboard: the busy button keeps focus and its width. Desktop also plays a season through the
  // weekly loop (about half a minute); the other sizes skip it, and season records go unmeasured.
  const desktop = info.project.name.endsWith('desktop');
  await page.fill('#calSeasons', '1');
  await page.fill('#calLoop', desktop ? '1' : '0');
  const run = page.locator('main form button[type=submit]');
  const idleWidth = (await run.boundingBox())?.width ?? 0;
  await run.focus();
  await page.keyboard.press('Enter');
  await expect(run).toHaveAttribute('aria-busy', 'true');
  await expect(run).toHaveAccessibleName('Running…');
  await expect(run).toBeFocused();
  expect((await run.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(idleWidth - 0.5);
  await expect(page.locator('progress[aria-label="Calibration progress"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();

  await expect(page.getByRole('heading', { name: 'Report' })).toBeVisible({ timeout: 150_000 });
  await expect(page.locator('main [role="status"]')).toContainText('Calibration finished');
  await expect(run).not.toHaveAttribute('aria-busy', 'true');
  await expect(run).toBeFocused();
  await expect(page.locator('main')).toContainText('1 season in 1 league');
  await expect(page.locator('main')).toContainText(
    desktop ? '1 weekly-loop season' : '0 weekly-loop seasons'
  );
  const seasons = page.locator('main .metric-region', {
    has: page.getByRole('heading', { name: 'Seasons', exact: true })
  });
  const winSd = seasons.locator('tr', { hasText: 'Team wins, sd' });
  if (await winSd.isVisible()) {
    await expect(seasons.getByRole('columnheader', { name: 'Weekly loop' })).toBeVisible();
    // Season records are judged on the weekly loop.
    await expect(winSd.locator('.status')).toHaveText(
      desktop ? /^(Pass|Warn|Fail) \(weekly loop\)$/ : 'Not measured yet (weekly loop)'
    );
  }
  for (const group of ['Games', 'Seasons', 'League stats', 'Effect sizes'])
    await expect(page.getByRole('heading', { name: group, exact: true })).toBeVisible();
  await expect(page.locator('main .metric-region .status:visible').first()).toBeVisible();
  expect(await contrastOf(page, 'main .metric-region .status-ok')).toBeGreaterThanOrEqual(4.5);
  await expectNoHorizontalOverflow(page);
  await expectTouchTargets(page, 'main', sizeOf(info) === 'phone' ? 48 : 44);
  await expectReportFits(page);

  // Rows stay readable without sideways scrolling at 200% text.
  await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
  await expectReportFits(page);
  await expectNoHorizontalOverflow(page);
  await page.evaluate(() => (document.documentElement.style.fontSize = ''));
});

test('keeps a run going across screens and cancels it from the keyboard', async ({ page }) => {
  test.setTimeout(120_000);
  await openDevTools(page);
  await page.fill('#calSeasons', '7');
  const run = page.locator('main form button[type=submit]');
  await run.focus();
  await page.keyboard.press('Enter');
  await expect(run).toHaveAttribute('aria-busy', 'true');

  // Leaving doesn't stop the run; coming back shows it with the form as it was.
  await page.evaluate(() => (location.hash = '#/settings'));
  await expect(page.locator('main h1')).toHaveText('Settings');
  await page.getByRole('link', { name: 'Open developer tools' }).click();
  await expect(page.locator('main h1')).toHaveText('Developer tools');
  await expect(page.locator('#calSeasons')).toHaveValue('7');
  await expect(run).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('progress[aria-label="Calibration progress"]')).toBeVisible();

  // Cancel says it's working until the replay in progress ends, then focus returns to Run.
  const cancel = page.getByRole('button', { name: 'Cancel' });
  await cancel.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Cancelling…' })).toBeFocused();
  await expect(page.locator('main [role="status"]')).toHaveText('Calibration cancelled.', {
    timeout: 30_000
  });
  await expect(run).not.toHaveAttribute('aria-busy', 'true');
  await expect(run).toBeFocused();
  await expect(page.getByRole('button', { name: /^Cancel/ })).toBeHidden();
  await expect(page.locator('main .empty')).toContainText('No report yet');
  await expectNoHorizontalOverflow(page);
});
