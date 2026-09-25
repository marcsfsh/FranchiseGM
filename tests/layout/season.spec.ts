import { expect, test } from '@playwright/test';
import { createLeague, expectNoHorizontalOverflow, expectTouchTargets, openGame } from './helpers';

// M7: advancing from the team hub, the inbox, the news, and the standings (spec 4.2, 19.2, 19.6).
test('plays a week from the hub and shows the result, inbox, news, and standings', async ({ page }, info) => {
  const phone = info.project.name.endsWith('phone');
  await openGame(page);
  await createLeague(page, { name: 'Season league', team: 'MIN', seed: '31' });
  await expect(page.locator('main h1')).toHaveText('Team hub');
  const status = page.locator('main p.sr-only[role="status"]');
  const play = page.getByRole('button', { name: 'Play week 1' });
  await play.focus();
  await page.keyboard.press('Enter');
  await expect(status).toHaveText('Played a week.', { timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Play week 2' })).toBeFocused();
  await expect(page.locator('main .hub-date')).toHaveText('2026 season · Week 2');

  const inbox = page.locator('main section.card', { hasText: 'Inbox' });
  await expect(inbox.locator('.inbox-item').first()).toBeVisible();
  await expect(inbox).toContainText(/Game result · Week 1 · New/);
  await expect(inbox).toContainText(/(Win|Loss|Tie) (against|at) the /);
  const news = page.locator('main section.card', { hasText: 'News: Week 1' });
  await expect(news.locator('li').first()).toBeVisible();
  await expect(news).toContainText('Players of the week');
  const standings = page.locator('main section.card', { hasText: 'Division standings' });
  await expect(standings.locator('.standing-row')).toHaveCount(4);
  await expect(standings.locator('.standing-row.is-us')).toContainText('Minnesota');
  await expectNoHorizontalOverflow(page);
  await expectTouchTargets(page, 'main', phone ? 48 : 44);

  await inbox.getByRole('button', { name: 'Mark all as read' }).click();
  await expect(status).toHaveText('All messages marked as read.');
  await expect(page.locator('main section.card', { hasText: 'Inbox' }).locator('.signbar-title')).toHaveText(
    'Inbox'
  );
});

test('sims to the playoffs and through the Super Bowl without pausing', async ({ page }, info) => {
  test.skip(!info.project.name.endsWith('desktop'), 'A whole season once per browser is enough.');
  test.setTimeout(300_000);
  await openGame(page);
  await createLeague(page, { name: 'Full season', team: 'MIN', seed: '31' });
  // Injuries to starters would stop the sim; turn that pause off first (spec 19.6).
  await page.evaluate(() => (location.hash = '#/settings'));
  const pause = page.getByLabel('Injuries to your starters');
  await expect(pause).toBeChecked();
  await pause.uncheck();
  await page.evaluate(() => (location.hash = '#/'));
  const status = page.locator('main p.sr-only[role="status"]');
  await page.getByRole('button', { name: 'Sim to the playoffs' }).click();
  await expect(status).toHaveText('Played 18 weeks.', { timeout: 200_000 });
  await expect(page.locator('main section.card', { hasText: 'playoff picture' })).toContainText(
    'The seeds are set.'
  );
  await page.getByRole('button', { name: 'Sim through the Super Bowl' }).click();
  await expect(status).toContainText(/Played 4 weeks\. The .+ won Super Bowl LXI\./, { timeout: 90_000 });
  await expect(page.locator('main section.card', { hasText: 'Next game and game plan' })).toContainText(
    'Super Bowl LXI'
  );
  await expect(page.getByRole('button', { name: /^Play / })).toHaveCount(0);
});
