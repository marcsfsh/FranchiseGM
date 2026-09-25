import { expect, test } from '@playwright/test';
import { SEASON_FIXTURE, SEASON_FIXTURE_NAME } from './global-setup';
import {
  expectNoHorizontalOverflow,
  expectRegionsMatchOverflow,
  expectTouchTargets,
  goTo,
  importLeagueFixture,
  sizeOf
} from './helpers';

// M9: the hub's cards and quick actions (spec 19.2, style guide 4.4, 7.6), the inbox, the news, and club pages.
test('shows the hub in order with the cap and a featured player, and opens the inbox and news', async ({ page }, info) => {
  const phone = sizeOf(info) === 'phone';
  await importLeagueFixture(page, SEASON_FIXTURE, SEASON_FIXTURE_NAME);
  const titles = await page.locator('main .signbar-title').allTextContents();
  expect(titles[0]).toBe('Next game and game plan');
  expect(titles[1]).toBe('Roster and injuries');
  expect(titles.slice(-2)).toEqual(['2026 cap', 'Featured player']);
  const next = page.locator('main section.card', { hasText: 'Next game and game plan' });
  for (const name of ['Play week 7', 'Set game plan', 'Free agency', 'Sim to the playoffs'])
    await expect(next.getByRole(/^Play|^Sim/.test(name) ? 'button' : 'link', { name })).toBeVisible();
  await expect(page.locator('main section.card', { hasText: 'Roster and injuries' }).getByRole('link', { name: 'Set lineup' })).toBeVisible();
  const featured = page.locator('main section.card', { hasText: 'Featured player' });
  await expect(featured.locator('.tier-lg')).toBeVisible();
  await expect(featured).toContainText('2026 cap hit');
  await expect(featured.locator('.attr')).toHaveCount(3);
  await expect(page.locator('main section.card', { hasText: '2026 cap' }).first().locator('.big-number')).toHaveText(/^−?\$/);
  await expectNoHorizontalOverflow(page);
  await expectTouchTargets(page, 'main', phone ? 48 : 44);

  await page.getByRole('link', { name: 'All messages' }).click();
  await expect(page.locator('main h1')).toHaveText('Inbox');
  const unread = await page.locator('main .inbox-item.is-unread').count();
  expect(unread).toBeGreaterThan(6);
  await page.getByRole('radio', { name: 'Unread only' }).check();
  await expect(page.locator('main [role="status"]')).toHaveText(`${unread} messages.`);
  await page.getByRole('button', { name: 'Mark all as read' }).click();
  await expect(page.locator('main [role="status"]')).toHaveText('All messages marked as read.');
  await expect(page.locator('main p.empty')).toHaveText('No unread messages.');
  await page.getByRole('radio', { name: 'All messages' }).check();
  await expect(page.locator('main .inbox-item.is-unread')).toHaveCount(0);
  await expectNoHorizontalOverflow(page);

  await goTo(page, '#/', 'Team hub');
  await page.getByRole('link', { name: 'All news' }).click();
  await expect(page.getByRole('tab', { name: 'News' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#newsWeek')).toHaveValue('6');
  const stories = page.locator('main section.card', { hasText: 'News: Week 6' }).locator('li');
  expect(await stories.count()).toBeGreaterThan(3);
  await expect(page.locator('main section.card', { hasText: 'Players of the week' }).locator('li').first()).toHaveText(/^(AFC|NFC) (offense|defense|special teams): .+, \S+: .+\.$/);
  await page.getByText('Only the Vikings').click();
  await expect(page.locator('main [role="status"]')).toHaveText(/^Week 6: \d+ stor(y|ies)\.$/);
  await expectNoHorizontalOverflow(page);
  await expectTouchTargets(page, 'main', phone ? 48 : 44);
}); // prettier-ignore

test("opens another club's page from the standings, with its roster and schedule", async ({ page }, info) => {
  const phone = sizeOf(info) === 'phone';
  await importLeagueFixture(page, SEASON_FIXTURE, SEASON_FIXTURE_NAME, { theme: 'night' });
  await goTo(page, '#/league/standings', 'League');
  await page.locator('main table', { has: page.locator('caption', { hasText: 'NFC North' }) }).getByRole('link', { name: 'Packers' }).click();
  await expect(page.locator('main h1')).toHaveText('Green Bay Packers');
  await expect(page.locator('main')).toContainText(/\d+–\d+(–\d+)?, (first|second|third|fourth) in the NFC North/);
  const roster = page.locator('main table.team-roster');
  await expect(roster.locator('.group-row').first()).toHaveText(/^Active roster \(5[0-3]\)$/);
  await expect(roster.locator('tbody tr:not(.group-row)').first().locator('td').nth(1)).toHaveText('QB');
  await expectRegionsMatchOverflow(page);
  await expectNoHorizontalOverflow(page);
  await expectTouchTargets(page, 'main', phone ? 48 : 44);
  await page.getByRole('tab', { name: 'Schedule' }).click();
  await expect(page.getByRole('list', { name: 'Packers schedule' }).locator('.game-card')).toHaveCount(18);
  await expectNoHorizontalOverflow(page);
  // The user's own page points to the roster screen.
  await goTo(page, '#/team/MIN/roster', 'Minnesota Vikings');
  await expect(page.getByRole('link', { name: 'Manage your roster' })).toBeVisible();
  await goTo(page, '#/team/XYZ/roster', 'Team');
  await expect(page.locator('main section.card', { hasText: 'Team not found' })).toBeVisible();
}); // prettier-ignore
