import { expect, test, type Page } from '@playwright/test';
import { FINISHED_FIXTURE, FINISHED_FIXTURE_NAME, SEASON_FIXTURE, SEASON_FIXTURE_NAME } from './global-setup';
import {
  expectNoHorizontalOverflow,
  expectRegionsMatchOverflow,
  expectTouchTargets,
  goTo,
  importLeagueFixture,
  sizeOf
} from './helpers';

/** The board's prospects as shown: table rows where there's room, list rows on phones. */
const prospects = (page: Page) =>
  page.locator('main .roster-list > li, main table.scout-table tbody tr').filter({ visible: true });

// Spec 10.4: the big board by the user's own grades, prospect details, and scouting by hand.
test('ranks the class by your grades and scouts prospects by hand', async ({ page }, info) => {
  test.setTimeout(180_000);
  const phone = sizeOf(info) === 'phone';
  await importLeagueFixture(page, SEASON_FIXTURE, SEASON_FIXTURE_NAME);
  await goTo(page, '#/scouting', 'Scouting and draft');
  const status = page.locator('main [role="status"]').last();
  await expect(page.locator('main .nameplate-tag')).toHaveText('2027 draft');
  await expect(page.locator('main')).toContainText('450 prospects in the 2027 class.');
  const auto = page.getByRole('switch', { name: 'Auto scouting' });
  await expect(auto).toHaveAttribute('aria-checked', 'true');
  await expect(prospects(page)).toHaveCount(40);
  await expect(prospects(page).first()).toContainText(/\d+–\d+/);
  await expectNoHorizontalOverflow(page);
  await expectRegionsMatchOverflow(page);
  await expectTouchTargets(page, 'main', phone ? 48 : 44);

  // A prospect's details: his grade as a range, and what the team hasn't learned yet. The director's points
  // have finished the very top of the board, so the first prospect he hasn't.
  const first = prospects(page).filter({ hasNotText: '100%' }).first().locator('.prospect-name');
  const name = (await first.textContent()) ?? '';
  await first.click();
  const dialog = page.getByRole('dialog', { name });
  await expect(dialog).toContainText('Your grade');
  await expect(dialog).toContainText(/— · Not (yet )?measured\./);
  await expect(dialog).toContainText("Top-30 visits, which show a prospect's character, open after the combine.");
  await expectNoHorizontalOverflow(page);
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(first).toBeFocused();

  // The filters narrow the board and keep focus; the count is announced.
  await page.selectOption('#scout-group', 'QB');
  await expect(page.locator('#scout-group')).toBeFocused();
  await expect(status).toContainText('among the quarterbacks');
  const positions = await prospects(page).locator('td:nth-child(2), .pos').allTextContents();
  expect(positions.every(p => p === 'QB')).toBe(true);
  await page.selectOption('#scout-group', 'all');

  // Scouting by hand: with auto on the director spent every point, so the first try says why.
  await auto.click();
  await expect(auto).toHaveAttribute('aria-checked', 'false');
  await expect(status).toHaveText('Auto scouting is off: you place your scouts, spend their points, and make your visits.');
  await page.getByRole('button', { name: `Scout ${name}` }).filter({ visible: true }).click();
  const toast = page.locator('.toast', { hasText: 'No points left' });
  await expect(toast).toBeVisible();
  await expect(toast).toContainText(/^No points left (in the \w+ or )?from your director\. Your scouts earn more each week\./);
  await toast.getByRole('button', { name: /^Dismiss/ }).click();
  // The dialog's actions say why in the footer beside them, in view.
  await first.click();
  const details = page.getByRole('dialog', { name });
  await details.getByRole('button', { name: `Scout ${name}` }).click();
  const note = details.locator('.dialog-actions [role="status"]');
  await expect(note).toContainText('No points left');
  await expect(note).toBeInViewport();
  await details.getByRole('button', { name: 'Close' }).click();

  // The scouts' tab: a scout sent to another region.
  await page.getByRole('tab', { name: 'Scouts' }).click();
  const region = page.getByRole('combobox', { name: /'s region$/ }).first();
  const scout = ((await region.getAttribute('aria-label')) ?? '').replace(/'s region$/, '');
  const to = (await region.inputValue()) === 'West' ? 'Northeast' : 'West';
  await region.selectOption(to);
  await expect(status).toHaveText(`${scout} now scouts the ${to}.`);
  await expect(page.getByRole('combobox', { name: `${scout}'s region` })).toBeFocused();
  await expect(page.getByRole('heading', { level: 2, name: 'Regions' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectRegionsMatchOverflow(page);

  // A week later the scouts have points to spend.
  await goTo(page, '#/', 'Team hub');
  const date = page.locator('main .hub-date');
  await page.getByRole('button', { name: 'Play week 7' }).click();
  await expect(date).toHaveText('2026 season · Week 8', { timeout: 120_000 });
  await goTo(page, '#/scouting', 'Scouting and draft');
  await page.getByRole('tab', { name: 'Big board' }).click();
  const scoutButton = page.getByRole('button', { name: `Scout ${name}` }).filter({ visible: true });
  await scoutButton.click();
  await expect(status).toHaveText(new RegExp(`^${name}: \\d+% scouted\\. Your grade: \\d+ to \\d+, \\d+(st|nd|rd|th) on your board\\.$`));
  await expect(scoutButton).toBeFocused();

  // Large text reflows the board, down to 320 pixels wide on a phone.
  await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
  await expectNoHorizontalOverflow(page);
  if (phone) {
    await page.setViewportSize({ width: 320, height: 640 });
    await expectNoHorizontalOverflow(page);
  }
}); // prettier-ignore

// The mock draft from midseason, the combine's results, and top-30 visits.
test('reads the mock draft, then the combine results, and brings a prospect in', async ({ page }, info) => {
  test.skip(info.project.name.endsWith('tablet'), 'Phone and desktop cover it.');
  test.setTimeout(240_000);
  await importLeagueFixture(page, FINISHED_FIXTURE, FINISHED_FIXTURE_NAME);
  await goTo(page, '#/scouting', 'Scouting and draft');
  const status = page.locator('main [role="status"]').last();
  await page.getByRole('tab', { name: 'Mock draft' }).click();
  await expect(page.locator('main')).toContainText('Published: Super Bowl.');
  const picks = page.locator('main .roster-list > li, main table.mock-table tbody tr').filter({ visible: true });
  await expect(picks).toHaveCount(32);
  await expect(picks.filter({ hasText: 'Minnesota Vikings (your pick)' })).toHaveCount(1);
  await expectNoHorizontalOverflow(page);
  await page.getByRole('tab', { name: 'Workouts' }).click();
  await expect(page.locator('main')).toContainText('No workouts yet.');

  // Through the re-sign window to the combine.
  await goTo(page, '#/', 'Team hub');
  const card = page.locator('main section.card', { hasText: 'The offseason' });
  for (const step of ['Awards and Hall of Fame', 'Re-sign window', 'Combine']) {
    await page.getByRole('button', { name: `Advance to ${step}` }).click();
    await expect(card.locator('.hero-title')).toHaveText(step, { timeout: 60_000 });
  }
  await goTo(page, '#/scouting', 'Scouting and draft');
  await page.getByRole('tab', { name: 'Workouts' }).click();
  await expect(page.locator('main .scout-count')).toHaveText(/^\d+ prospects worked out\.$/);
  await expect(page.locator('main table tbody tr').first()).toContainText('Combine');
  await expect(page.locator('main table thead')).toContainText('40 (s)');
  await expectNoHorizontalOverflow(page);
  await expectRegionsMatchOverflow(page);

  // A top-30 visit shows his character.
  await page.getByRole('switch', { name: 'Auto scouting' }).click();
  await page.getByRole('tab', { name: 'Big board' }).click();
  const first = prospects(page).first().locator('.prospect-name');
  const name = (await first.textContent()) ?? '';
  await page.getByRole('button', { name: `Bring ${name} in for a visit` }).filter({ visible: true }).click();
  await expect(status).toHaveText(`${name} came in for a visit. 1 of 30 visits made.`);
  await expect(prospects(page).first()).toContainText('Visited');
  await prospects(page).first().locator('.prospect-name').click();
  const dialog = page.getByRole('dialog', { name });
  await expect(dialog).toContainText('Work ethic');
  await expect(dialog).toContainText('At the combine.');
  await expectNoHorizontalOverflow(page);
}); // prettier-ignore

// Spec 22.4: the draft class settings.
test('changes and resets the draft class settings', async ({ page }, info) => {
  const phone = sizeOf(info) === 'phone';
  await importLeagueFixture(page, SEASON_FIXTURE, SEASON_FIXTURE_NAME);
  await goTo(page, '#/settings', 'Settings');
  const card = page.locator('main section.card', { hasText: 'Draft classes' });
  const status = card.locator('[role="status"]');
  const size = card.getByLabel('Prospects in each class');
  await size.fill('800');
  await size.press('Tab');
  await expect(status).toHaveText('Class size: 700 prospects, the most allowed.');
  await expect(size).toHaveValue('700');
  const accuracy = card.getByRole('slider', { name: 'Scouting accuracy' });
  await accuracy.focus();
  await page.keyboard.press('ArrowRight');
  await expect(accuracy).toHaveAttribute('aria-valuetext', '105%');
  const strength = card.getByRole('slider', { name: 'Class strength', exact: true });
  await strength.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(strength).toHaveAttribute('aria-valuetext', '−5%, weaker');

  await card.locator('summary', { hasText: 'By position group' }).click();
  const busts = card.getByRole('spinbutton', { name: 'Busts, quarterbacks, percent' });
  await busts.fill('150');
  await busts.press('Tab');
  await expect(status).toHaveText('Busts, quarterbacks: 150%.');
  const deep = card.getByRole('spinbutton', { name: 'Strength, receivers, percent' });
  await deep.fill('-120');
  await deep.press('Tab');
  await expect(status).toHaveText('Strength, receivers: −100%, the least allowed.');
  const development = card.getByRole('spinbutton', { name: 'Development variation, defensive line, percent' });
  await development.fill('62');
  await development.press('Tab');
  await expect(status).toHaveText('Development variation, defensive line: 60%, to the nearest 5.');
  await card.locator('summary', { hasText: 'Position mix' }).click();
  const mix = card.getByRole('spinbutton', { name: 'Share, QB, percent' });
  await mix.fill('');
  await mix.press('Tab');
  await expect(status).toHaveText('Share, QB: enter a whole number from 0 to 200. It stays at 100%.');

  await expectNoHorizontalOverflow(page);
  await expectRegionsMatchOverflow(page);
  await expectTouchTargets(page, 'main', phone ? 48 : 44);
  // Large text reflows the card, and each slider keeps room for its track.
  await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
  if (phone) await page.setViewportSize({ width: 320, height: 640 });
  await expectNoHorizontalOverflow(page);
  for (const name of ['Scouting accuracy', 'Class strength', 'Class strength variation'])
    expect((await card.getByRole('slider', { name, exact: true }).boundingBox())?.width ?? 0).toBeGreaterThan(40);
  await page.evaluate(() => (document.documentElement.style.fontSize = ''));

  await card.getByRole('button', { name: 'Reset draft classes to normal' }).click();
  const dialog = page.getByRole('dialog', { name: 'Reset draft classes' });
  await dialog.getByRole('button', { name: 'Reset 6 settings' }).click();
  await expect(status).toHaveText('Every draft class setting is back to normal.');
  await expect(card.getByRole('button', { name: 'Reset draft classes to normal' })).toBeFocused();
  await expect(card.getByLabel('Prospects in each class')).toHaveValue('450');
}); // prettier-ignore
