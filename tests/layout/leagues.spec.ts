import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createLeague, expectNoHorizontalOverflow, openGame } from './helpers';

// M2 done-when: a league can be created, the page reloaded, and the league continued.
test('creates a league, reloads, and continues it', async ({ page }) => {
  await openGame(page);
  await expect(page.locator('main h1')).toHaveText('Leagues');
  await expect(page.getByText('No leagues yet.')).toBeVisible();
  await createLeague(page, { name: 'Reload league', team: 'DET', seed: '77' });
  await expect(page.locator('html')).toHaveAttribute('data-team', 'DET');
  await expect(page.locator('main .nameplate-tag')).toHaveText('Detroit Lions');
  await expect(page.locator('main .hub-date')).toHaveText('2026 season · Week 1');
  await expectNoHorizontalOverflow(page);

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('main h1')).toHaveText('Team hub');
  await expect(page.locator('main')).toContainText('Detroit Lions');

  // Switching leagues saves and lists it with team, season, and week.
  await page.evaluate(() => (location.hash = '#/settings'));
  await page.getByRole('button', { name: 'Switch league' }).click();
  await expect(page.locator('main h1')).toHaveText('Leagues');
  const card = page.locator('[data-league-id]');
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('Reload league');
  await expect(card).toContainText('Detroit Lions');
  await expect(card).toContainText('2026 season · Week 1');
  await card.getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('main h1')).toHaveText('Team hub');
});

test('exports, imports a copy, and deletes a league', async ({ page }, info) => {
  test.skip(!info.project.name.endsWith('desktop'), 'Once per browser is enough.');
  await openGame(page);
  await createLeague(page, { name: 'Export league', team: 'GB', seed: '5' });
  await page.evaluate(() => (location.hash = '#/settings'));
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export league', exact: true }).click()
  ]);
  expect(download.suggestedFilename()).toBe('franchise-gm-export-league-2026-week-1.json.gz');
  const file = await download.path();
  const bytes = readFileSync(file);
  expect([bytes[0], bytes[1]]).toEqual([0x1f, 0x8b]);

  await page.getByRole('button', { name: 'Switch league' }).click();
  await page.setInputFiles('#importLeagueFile', {
    name: 'league.json.gz',
    mimeType: 'application/gzip',
    buffer: bytes
  });
  await expect(page.locator('[data-league-id]')).toHaveCount(2);
  await expect(page.getByRole('heading', { name: 'Export league (copy)' })).toBeVisible();

  const copy = page.locator('[data-league-id]', { hasText: 'Export league (copy)' });
  await copy.getByRole('button', { name: 'Delete' }).click();
  const dialog = page.locator('#deleteLeagueDialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Delete Export league (copy)' }).click();
  await expect(page.locator('[data-league-id]')).toHaveCount(1);
  // The deleted card's button is gone, so focus moves to the remaining league.
  await expect(page.locator('[data-league-id]').getByRole('button', { name: 'Continue' })).toBeFocused();
});

test('keeps a league open when switching fails to save it', async ({ page }, info) => {
  test.skip(!info.project.name.endsWith('desktop'), 'Once per browser is enough.');
  await openGame(page);
  await createLeague(page, { name: 'Unsaved league', team: 'BUF', seed: '3' });
  await page.evaluate(() => (location.hash = '#/settings'));
  await page.evaluate(() => {
    const gm = (globalThis as unknown as { __gm: { app: { store: { save: () => Promise<never> } } } }).__gm;
    gm.app.store.save = () => Promise.reject(new Error('the disk is full'));
  });
  await page.getByRole('button', { name: 'Switch league' }).click();
  await expect(page.getByText("Couldn't save Unsaved league, so it's still open.")).toBeVisible();
  await expect(page.locator('main h1')).toHaveText('Settings');
  await expect(page.getByRole('button', { name: 'Export league', exact: true }).first()).toBeVisible();

  // The league list isn't reachable while a league is open; it would replace the open league.
  await page.evaluate(() => (location.hash = '#/leagues'));
  await expect(page.locator('main h1')).toHaveText('Team hub');
});

test('the new league form reflows at 320 pixels with 200% text', async ({ page }, info) => {
  test.skip(!info.project.name.endsWith('phone'), 'A phone-width check.');
  await page.setViewportSize({ width: 320, height: 700 });
  await openGame(page);
  await page.evaluate(() => (location.hash = '#/leagues/new'));
  await expect(page.locator('#leagueName')).toBeVisible();
  await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
  await expectNoHorizontalOverflow(page);
});

test('rejects a file that is not a league export', async ({ page }, info) => {
  test.skip(!info.project.name.endsWith('desktop'), 'Once per browser is enough.');
  await openGame(page);
  await page.setInputFiles('#importLeagueFile', {
    name: 'notes.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"hello":1}')
  });
  await expect(page.getByText("Couldn't import that file.")).toBeVisible();
});

test('a team color preview does not survive a reload', async ({ page }, info) => {
  test.skip(!info.project.name.endsWith('desktop'), 'Once per browser is enough.');
  await openGame(page);
  await createLeague(page, { team: 'SEA', seed: '9' });
  await page.evaluate(() => (location.hash = '#/settings'));
  await page.selectOption('#teamSel', 'KC');
  await expect(page.locator('html')).toHaveAttribute('data-team', 'KC');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-team', 'SEA');
});
