import { expect, test, type Locator } from '@playwright/test';
import { SEASON_FIXTURE, SEASON_FIXTURE_NAME } from './global-setup';
import { expectNoHorizontalOverflow, expectTouchTargets, goTo, importLeagueFixture, sizeOf } from './helpers';

// Post-M23 section 1.2: every table sorts by any column, and by up to four at once, from its headers or its
// Sort control, announcing each order and keeping it for the visit.
const numbers = async (cells: Locator): Promise<number[]> =>
  (await cells.allTextContents()).map(t => Number(t.replace(/[^\d.-]/g, '')));

test('sorts a leaderboard by one column and then another, from the headers and the Sort panel', async ({ page }, info) => {
  const phone = sizeOf(info) === 'phone';
  await importLeagueFixture(page, SEASON_FIXTURE, SEASON_FIXTURE_NAME);
  await goTo(page, '#/league/stats', 'League');
  const table = page.locator('main table.leader-table');
  const rows = table.locator('tbody tr');
  await expect(rows.first()).toBeVisible();
  const status = page.locator('main [role="status"]');
  const games = table.getByRole('columnheader', { name: 'Games played' });
  const total = table.getByRole('columnheader', { name: 'Passing yards' });

  // A header sorts by its column alone, high to low for numbers, and keeps focus.
  const gamesButton = games.getByRole('button');
  await gamesButton.focus();
  await page.keyboard.press('Enter');
  await expect(status).toHaveText('Sorted by games played, high to low.');
  await expect(games).toHaveAttribute('aria-sort', 'descending');
  await expect(gamesButton).toBeFocused();
  const played = await numbers(rows.locator('td:nth-child(6)'));
  expect(played).toEqual([...played].sort((a, b) => b - a));

  // Shift adds the next level: passing yards break ties on games. Only the leading column has aria-sort.
  await total.getByRole('button').click({ modifiers: ['Shift'] });
  await expect(status).toHaveText('Sorted by games played, high to low, then passing yards, high to low.');
  await expect(total).not.toHaveAttribute('aria-sort', /./);
  await expect(games.locator('.sort-mark')).toHaveText('1');
  await expect(total.locator('.sort-mark')).toHaveText('2');
  const pairs = (await rows.all()).length;
  const both = await Promise.all(
    Array.from({ length: pairs }, async (_, i) => ({
      g: Number(await rows.nth(i).locator('td:nth-child(6)').textContent()),
      y: Number(((await rows.nth(i).locator('td:nth-child(3)').textContent()) ?? '').replace(/,/g, ''))
    }))
  );
  for (let i = 1; i < both.length; i++) {
    const [a, b] = [both[i - 1], both[i]] as [{ g: number; y: number }, { g: number; y: number }];
    expect(a.g > b.g || (a.g === b.g && a.y >= b.y), `row ${i + 1}`).toBe(true);
  }

  // The same header again reverses it and drops the other level.
  await gamesButton.click();
  await expect(status).toHaveText('Sorted by games played, low to high.');
  await expect(games).toHaveAttribute('aria-sort', 'ascending');

  // The Sort panel does the same by keyboard and touch: add a level, change its direction, reorder, remove.
  const toggle = page.getByRole('button', { name: 'Sort leaders' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const panel = page.getByRole('group', { name: 'Sort leaders' });
  await panel.getByRole('button', { name: 'Add a sort column' }).click();
  const second = panel.getByRole('combobox', { name: 'Then by, second column' });
  await expect(second).toBeFocused();
  await second.selectOption({ label: 'Passing yards' });
  await expect(status).toHaveText('Sorted by games played, low to high, then passing yards, high to low.');
  await panel.getByRole('combobox', { name: 'Direction for passing yards' }).selectOption({ label: 'Low to high' });
  await expect(status).toHaveText('Sorted by games played, low to high, then passing yards, low to high.');
  await panel.getByRole('button', { name: 'Move passing yards up' }).click();
  await expect(status).toHaveText('Sorted by passing yards, low to high, then games played, low to high.');
  await expect(panel.getByRole('button', { name: 'Move passing yards down' })).toBeFocused();
  await expect(total).toHaveAttribute('aria-sort', 'ascending');
  await expectNoHorizontalOverflow(page);
  await expectTouchTargets(page, 'main', phone ? 48 : 44);
  await panel.getByRole('button', { name: 'Remove games played' }).click();
  await expect(status).toHaveText('Sorted by passing yards, low to high.');

  // The sort stays with the table through the visit.
  await goTo(page, '#/league/standings', 'League');
  await goTo(page, '#/league/stats', 'League');
  await expect(page.locator('main .leader-table th[aria-sort]')).toHaveAccessibleName(/^Passing yards/);
  await expect(page.locator('main .sort-summary')).toHaveText('Sorted by passing yards, low to high.');

  // Reset sort returns the leaderboard's own order, and Done closes the panel onto its control.
  await page.getByRole('button', { name: 'Sort leaders' }).click();
  await page.getByRole('button', { name: 'Reset sort' }).click();
  await expect(status).toHaveText('Sorted by rank.');
  await expect(page.locator('main .leader-table tbody tr').first().locator('td').first()).toHaveText(/^(T-)?1$/);
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('button', { name: 'Sort leaders' })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Sort leaders' })).toHaveAttribute('aria-expanded', 'false');
}); // prettier-ignore

test('keeps the Sort panel usable at 320 pixels with 200% text', async ({ page }, info) => {
  test.skip(sizeOf(info) !== 'phone', 'A phone check.');
  await importLeagueFixture(page, SEASON_FIXTURE, SEASON_FIXTURE_NAME);
  await page.setViewportSize({ width: 320, height: 640 });
  await goTo(page, '#/league/stats', 'League');
  await expect(page.locator('main table.leader-table tbody tr').first()).toBeVisible();
  await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
  // By keyboard: the app bars cover parts of a page this narrow while it scrolls.
  await page.getByRole('button', { name: 'Sort leaders' }).focus();
  await page.keyboard.press('Enter');
  const panel = page.getByRole('group', { name: 'Sort leaders' });
  const add = panel.getByRole('button', { name: 'Add a sort column' });
  await add.focus();
  await page.keyboard.press('Enter');
  await add.focus();
  await page.keyboard.press('Enter');
  await expect(panel.locator('.sort-level')).toHaveCount(2);
  await expectNoHorizontalOverflow(page);
  await expectTouchTargets(page, '.sort-panel', 48);
});
