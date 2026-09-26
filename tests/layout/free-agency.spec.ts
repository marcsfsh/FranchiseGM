import { expect, test, type Page } from '@playwright/test';
import { FA_FIXTURE, FA_FIXTURE_NAME } from './global-setup';
import {
  expectNoHorizontalOverflow,
  expectRegionsMatchOverflow,
  expectTouchTargets,
  goTo,
  importLeagueFixture,
  sizeOf
} from './helpers';

/** The free agents as shown: table rows where there's room, list rows on phones. */
/** The free agents' rows, on a phone or wider; players on waivers, listed apart, aren't among them. */
const agents = (page: Page) =>
  page
    .locator('main .fa-list > li')
    .or(page.getByRole('table', { name: 'Free agents' }).locator('tbody tr'))
    .filter({ visible: true });

// Spec 11.8 (D-53): through free agency's weeks, the user's offers stand until the week ends, when the free
// agents weigh every team's offers.
test('makes a standing offer in free agency, and hears the answer as the week ends', async ({ page }, info) => {
  test.skip(info.project.name.endsWith('tablet'), 'Phone and desktop cover it.');
  test.setTimeout(180_000);
  const phone = sizeOf(info) === 'phone';
  await importLeagueFixture(page, FA_FIXTURE, FA_FIXTURE_NAME);
  await goTo(page, '#/free-agency', 'Free agency');
  const summary = page.locator('main section.card', { hasText: 'Your roster and cap' });
  await expect(summary).toContainText(/Free agency, week 1: offers stand until the week ends, when free agents decide\. You have 0 offers standing/);
  await expect(agents(page).first()).toBeVisible();
  if (!phone) await expect(page.getByRole('table', { name: 'Free agents' }).locator('thead')).toContainText('Bidding');
  await expectNoHorizontalOverflow(page);
  await expectRegionsMatchOverflow(page);
  await expectTouchTargets(page, 'main', phone ? 48 : 44);

  // An offer: the dialog says what he asks of the user's team and how he'd weigh the offer as things stand.
  const first = agents(page).first();
  const name = (await first.locator('a').first().textContent()) ?? '';
  await first.getByRole('button', { name: `Make an offer to ${name}` }).click();
  const dialog = page.getByRole('dialog', { name: `Offer ${name} a contract` });
  await expect(dialog).toContainText(/He asks you for \$[\d,]+ a year\. Offers stand until the week ends/);
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await expect(dialog.locator('[role="status"]')).toHaveText(/^As (the offers stand, he would take (yours|another team's)|things stand, it isn't enough: he would wait for more)/);
  await expectTouchTargets(page, '#bidDialog', phone ? 48 : 44);
  await dialog.getByRole('button', { name: 'Send offer' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('#toastRegion .toast').last()).toContainText(new RegExp(`^You offered ${name} \\$[\\d,]+ a year for 1 year\\. He decides as the week ends\\.`));
  await expect(page.getByRole('button', { name: `Make an offer to ${name}` }).filter({ visible: true })).toHaveText('Change your offer');
  await expect(summary).toContainText(/You have 1 offer standing, \$[\d,]+ on your cap if all are taken\./);
  if (phone) {
    const size = page.viewportSize();
    await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
    await page.setViewportSize({ width: 320, height: 640 });
    await expectNoHorizontalOverflow(page);
    await page.evaluate(() => (document.documentElement.style.fontSize = ''));
    if (size) await page.setViewportSize(size);
  }

  // The week ends: the inbox says who signed with the user and who is still weighing.
  await goTo(page, '#/', 'Team hub');
  await page.mouse.move(0, 0);
  await expect(page.locator('#toastRegion .toast')).toHaveCount(0, { timeout: 15_000 });
  const hub = page.locator('main section.card', { hasText: 'The offseason' });
  await hub.getByRole('button', { name: /^Advance to Free agency, week 2$/ }).click();
  await expect(hub.locator('.hero-title')).toHaveText('Free agency, week 2', { timeout: 60_000 });
  await goTo(page, '#/inbox', 'Inbox');
  await expect(page.locator('main .inbox-item', { hasText: /Free agency, week 1: (\d+ players? signed with you|nobody signed with you)/ }).first()).toBeVisible();
}); // prettier-ignore
