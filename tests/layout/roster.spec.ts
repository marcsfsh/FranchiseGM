import { expect, test } from '@playwright/test';
import { createLeague, expectNoHorizontalOverflow, expectTouchTargets, openGame } from './helpers';

// M3: the player page explains fit in the user's schemes (spec 7.3, 7.7).
test('lists the roster with fit and opens a player with the fit breakdown', async ({ page }, info) => {
  await openGame(page);
  await createLeague(page, { name: 'Fit league', team: 'SF', seed: '31' });
  await page.evaluate(() => (location.hash = '#/roster'));
  await expect(page.locator('main h1')).toHaveText('Roster');
  await expect(page.locator('main')).toContainText('53 active players and 16 on the practice squad.');
  const phone = info.project.name.endsWith('phone');
  const rows = phone ? page.locator('.roster-list > li') : page.locator('.roster-table tbody tr');
  await expect(rows).toHaveCount(69);
  await expect(phone ? page.locator('.roster-table') : page.locator('.roster-list')).toBeHidden();
  await expectNoHorizontalOverflow(page);
  const target = phone ? 48 : 44;
  await expectTouchTargets(page, 'main', target);

  // Open a player from partway down the roster.
  const row = rows.nth(30).locator('a');
  const name = (await row.textContent()) ?? '';
  await row.scrollIntoViewIfNeeded();
  const scroll = await page.evaluate(() => window.scrollY);
  await row.click();
  await expect(page.locator('main h1')).toHaveText(name);
  await expect(page.locator('main h1')).toBeFocused();
  await expect(page).toHaveTitle(`${name} · Franchise GM`);
  await expectTouchTargets(page, 'main', target);
  const fit = page.locator('main section.card', { hasText: 'Scheme fit' });
  await expect(fit).toContainText(/(Good|Fair|Poor) fit for /);
  await expect(fit.getByRole('list', { name: 'Roles he can play' }).locator('li').first()).toBeVisible();
  // Comparing schemes redraws the breakdown and keeps the control in place.
  const select = page.locator('#fitScheme');
  await select.focus();
  await page.selectOption('#fitScheme', { index: 2 });
  await expect(select).toBeFocused();
  await expect(fit).toContainText(/(Good|Fair|Poor) fit for /);

  const toggle = page.getByRole('button', { name: 'Show all ratings' });
  await toggle.click();
  await expect(page.getByRole('button', { name: 'Hide all ratings' })).toHaveAttribute(
    'aria-expanded',
    'true'
  );
  await expect(page.locator('#allRatings')).toContainText('Kick return');
  await expectNoHorizontalOverflow(page);
  // Rating rows reflow at 200% text.
  await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
  await expectNoHorizontalOverflow(page);
  await page.evaluate(() => (document.documentElement.style.fontSize = ''));

  // Back on the roster: the same place, with focus on the player just viewed.
  await page.goBack();
  await expect(page.locator('main h1')).toHaveText('Roster');
  await expect(rows.nth(30).locator('a')).toBeFocused();
  expect(Math.abs((await page.evaluate(() => window.scrollY)) - scroll)).toBeLessThanOrEqual(2);
});

test('shows a clear message for an unknown player', async ({ page }, info) => {
  test.skip(!info.project.name.endsWith('desktop'), 'Once per browser is enough.');
  await openGame(page);
  await createLeague(page, { team: 'NYJ', seed: '4' });
  await page.evaluate(() => (location.hash = '#/player/p999999'));
  await expect(page.locator('main h1')).toHaveText('Player not found');
  await expect(page.getByRole('link', { name: 'Back to roster' })).toBeVisible();
});
