import { expect, test } from '@playwright/test';
import { FINISHED_FIXTURE, FINISHED_FIXTURE_NAME } from './global-setup';
import { expectNoHorizontalOverflow, expectTouchTargets, goTo, importLeagueFixture, sizeOf } from './helpers';

// Spec 4.1: the offseason from the Super Bowl to the next season's week 1, a step at a time or all at once.
test('walks the offseason from the hub into the next season', async ({ page }, info) => {
  test.skip(info.project.name.endsWith('tablet'), 'Phone and desktop cover it.');
  test.setTimeout(300_000);
  const phone = sizeOf(info) === 'phone';
  await importLeagueFixture(page, FINISHED_FIXTURE, FINISHED_FIXTURE_NAME);
  const card = page.locator('main section.card', { hasText: 'The offseason' });
  const status = page.locator('main [role="status"]').last();
  await expect(card.locator('.hero-title')).toHaveText('Staff management');
  await expect(card).toContainText(/won Super Bowl LXI/);
  await expect(page.locator('main .hub-date')).toHaveText('2026 season · Staff management');
  await expectNoHorizontalOverflow(page);
  await expectTouchTargets(page, 'main', phone ? 48 : 44);

  // One step: the awards, then the retirements that follow them.
  const step = page.getByRole('button', { name: 'Advance to Awards and Hall of Fame' });
  await step.focus();
  await page.keyboard.press('Enter');
  await expect(card.locator('.hero-title')).toHaveText('Awards and Hall of Fame', { timeout: 60_000 });
  await expect(status).toHaveText('Now: Awards and Hall of Fame.');
  await expect(page.getByRole('button', { name: 'Advance to Re-sign window' })).toBeFocused();

  // The rest of the way stops at the re-sign window, a deadline for the user's decisions; then free agency,
  // the draft, the schedule, and the cutdown.
  await page.getByRole('button', { name: 'Sim to the 2027 season' }).click();
  await expect(status).toHaveText('Now: Re-sign window. Stopped for: The re-sign window is open.', { timeout: 60_000 });
  await expect(card.getByRole('link', { name: 'Contracts' })).toBeVisible();
  await page.getByRole('button', { name: 'Sim to the 2027 season' }).click();
  await expect(status).toHaveText('The 2027 season is here: week 1.', { timeout: 240_000 });
  await expect(page.locator('main .hub-date')).toHaveText('2027 season · Week 1');
  await expect(page.locator('main section.card', { hasText: 'Next game and game plan' })).toContainText('Week 1');
  await expect(page.getByRole('button', { name: 'Play week 1' })).toBeVisible();

  // The offseason's messages, by the step each came with.
  await goTo(page, '#/inbox', 'Inbox');
  await expect(page.locator('main .inbox-item', { hasText: /The 2027 league year opens with a \$[\d,]+ cap/ })).toContainText('Contracts · Free agency, week 1');
  await expect(page.locator('main .inbox-item', { hasText: 'Your 2027 draft class' })).toContainText('Draft · Draft');
  await expect(page.locator('main .inbox-item', { hasText: 'The 2027 schedule is out' })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  // The new season's schedule.
  await goTo(page, '#/league/schedule', 'League');
  await expect(page.locator('main .game-card').first()).toBeVisible();
  await expect(page.locator('main')).toContainText('2027');
}); // prettier-ignore
