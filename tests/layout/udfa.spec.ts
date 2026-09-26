import { expect, test, type Page } from '@playwright/test';
import { DRAFT_FIXTURE, DRAFT_FIXTURE_NAME } from './global-setup';
import {
  expectNoHorizontalOverflow,
  expectRegionsMatchOverflow,
  expectTouchTargets,
  goTo,
  importLeagueFixture,
  sizeOf
} from './helpers';

/** The undrafted rookies as shown: table rows where there's room, list rows on phones. */
const rookies = (page: Page) =>
  page.locator('main .udfa-card .roster-list > li, main .udfa-card table tbody tr').filter({ visible: true });

// Spec 10.4 (D-49): after the draft, undrafted rookies take offers with a signing bonus from each team's pool,
// and choose as the undrafted free agents step ends.
test('offers undrafted rookies a bonus, and hears who signed as the step ends', async ({ page }, info) => {
  test.skip(info.project.name.endsWith('tablet'), 'Phone and desktop cover it.');
  test.setTimeout(180_000);
  const phone = sizeOf(info) === 'phone';
  await importLeagueFixture(page, DRAFT_FIXTURE, DRAFT_FIXTURE_NAME);
  await goTo(page, '#/draft', 'Draft room');
  await page.getByRole('button', { name: 'Auto-draft the rest' }).click();
  await page.getByRole('dialog', { name: 'Auto-draft the rest' }).getByRole('button', { name: /^Auto-draft \d+ picks$/ }).click();
  await expect(page.locator('main section.card', { hasText: "The media's grades" })).toBeVisible();

  // The scramble opens with the draft's end.
  await goTo(page, '#/free-agency', 'Free agency');
  const card = page.locator('main .udfa-card');
  await expect(card).toContainText('The rookies nobody drafted choose among teams\' offers');
  await expect(card.locator('.udfa-count')).toHaveText('226 rookies.');
  await expect(rookies(page)).toHaveCount(40);
  await expectNoHorizontalOverflow(page);
  await expectRegionsMatchOverflow(page);
  await expectTouchTargets(page, 'main', phone ? 48 : 44);

  // An offer: the dialog says whose offer he'd take, and the row shows the user's.
  const first = rookies(page).first();
  const name = (await first.locator('a').first().textContent()) ?? '';
  await first.getByRole('button', { name: `Offer ${name} a bonus` }).click();
  const dialog = page.getByRole('dialog', { name: `Offer ${name} a signing bonus` });
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await dialog.getByLabel('Signing bonus, dollars').fill('12345');
  await expect(dialog).toContainText('in steps of $5,000');
  await dialog.getByLabel('Signing bonus, dollars').fill('25000');
  await expect(dialog.locator('[role="status"]')).toHaveText('As the offers stand now, he would take yours.');
  await expectTouchTargets(page, '#udfaDialog', phone ? 48 : 44);
  await dialog.getByRole('button', { name: 'Send offer' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('#toastRegion .toast').last()).toContainText(`You offered ${name} a $25,000 signing bonus.`);
  const change = page.getByRole('button', { name: `Change your offer to ${name}` }).filter({ visible: true });
  await expect(change).toBeFocused();
  await expect(card).toContainText("Your pool has $175,000 left. You've made 1 offer.");

  // The filter narrows the list and says how many.
  await page.selectOption('#udfa-group', 'QB');
  await expect(page.locator('#udfa-group')).toBeFocused();
  await expect(page.locator('main [role="status"]').last()).toHaveText(/^\d+ rookies? among the quarterbacks\.$/);
  await page.selectOption('#udfa-group', 'all');

  // The other teams' offers come in with the undrafted free agents step; the rookies choose as it ends.
  await goTo(page, '#/', 'Team hub');
  await page.mouse.move(0, 0);
  await expect(page.locator('#toastRegion .toast')).toHaveCount(0, { timeout: 15_000 });
  const hub = page.locator('main section.card', { hasText: 'The offseason' });
  await hub.getByRole('button', { name: 'Advance to Undrafted free agents' }).click();
  await expect(hub.locator('.hero-title')).toHaveText('Undrafted free agents', { timeout: 60_000 });
  await goTo(page, '#/free-agency', 'Free agency');
  await expect(rookies(page).filter({ hasText: /\d+ teams?|Other offers: \d+ teams?/ }).first()).toBeVisible();
  if (phone) {
    const size = page.viewportSize();
    await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
    await page.setViewportSize({ width: 320, height: 640 });
    await expectNoHorizontalOverflow(page);
    await page.evaluate(() => (document.documentElement.style.fontSize = ''));
    if (size) await page.setViewportSize(size);
  }
  await goTo(page, '#/', 'Team hub');
  await page.mouse.move(0, 0);
  await expect(page.locator('#toastRegion .toast')).toHaveCount(0, { timeout: 15_000 });
  await hub.getByRole('button', { name: 'Advance to OTAs and minicamp' }).click();
  await expect(hub.locator('.hero-title')).toHaveText('OTAs and minicamp', { timeout: 60_000 });
  await goTo(page, '#/inbox', 'Inbox');
  await expect(page.locator('main .inbox-item', { hasText: /^.*Undrafted rookies: (\d+ rookies? signed|none signed) with you/ }).first()).toBeVisible();
}); // prettier-ignore
