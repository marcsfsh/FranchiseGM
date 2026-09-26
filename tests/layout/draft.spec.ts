import { expect, test, type Page } from '@playwright/test';
import { DRAFT_FIXTURE, DRAFT_FIXTURE_NAME, SEASON_FIXTURE, SEASON_FIXTURE_NAME } from './global-setup';
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
  page
    .locator('main .draft-board .roster-list > li, main .draft-board table tbody tr')
    .filter({ visible: true });
/** The latest toast, where a pick's result is said. */
const said = (page: Page) => page.locator('#toastRegion .toast').last();

/** Large text on a narrow phone: nothing runs off the page. */
async function largeText(page: Page): Promise<void> {
  await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
  await page.setViewportSize({ width: 320, height: 640 });
  await expectNoHorizontalOverflow(page);
  await page.evaluate(() => (document.documentElement.style.fontSize = ''));
}

// Spec 10.4 (D-48): the draft waits for the user's pick, made by hand from the board or by the staff, and the
// media grade every class once it's over.
test('makes picks in the draft room, then shows the class and the grades', async ({ page }, info) => {
  test.setTimeout(180_000);
  const phone = sizeOf(info) === 'phone';
  await importLeagueFixture(page, DRAFT_FIXTURE, DRAFT_FIXTURE_NAME);
  const hub = page.locator('main section.card', { hasText: 'The offseason' });
  await expect(hub).toContainText(/you're on the clock with the \d+(st|nd|rd|th) pick/);

  // The league waits for the pick.
  await hub.getByRole('button', { name: 'Advance to Undrafted free agents' }).click();
  await expect(page.locator('main [role="status"]').last()).toContainText("You're on the clock with the", { timeout: 60_000 });
  await hub.getByRole('link', { name: 'Draft room' }).click();
  await expect(page.locator('main h1')).toHaveText('Draft room');
  await expect(page.locator('main .nameplate-tag')).toHaveText('2027 draft');
  const status = page.locator('main [role="status"]').last();
  const clock = page.locator('main section.card').filter({ has: page.getByRole('heading', { name: 'On the clock' }) });
  await expect(clock.locator('.hero-title')).toHaveText("You're on the clock");
  await expect(clock).toContainText(/^On the clockRound 1, pick \d+/);
  await expect(prospects(page)).toHaveCount(40);
  await expectNoHorizontalOverflow(page);
  await expectRegionsMatchOverflow(page);
  await expectTouchTargets(page, 'main', phone ? 48 : 44);

  // The filter narrows the board and says how many are left; a prospect's details open from his name.
  await page.selectOption('#draft-group', 'QB');
  await expect(page.locator('#draft-group')).toBeFocused();
  await expect(status).toHaveText(/^\d+ prospects? left among the quarterbacks\.$/);
  await page.selectOption('#draft-group', 'all');
  const first = prospects(page).first();
  const name = (await first.locator('.prospect-name').textContent()) ?? '';
  await first.locator('.prospect-name').click();
  const details = page.getByRole('dialog', { name });
  await expect(details).toContainText('Your grade');
  await details.getByRole('button', { name: 'Close' }).click();
  await expect(first.locator('.prospect-name')).toBeFocused();

  // A pick by hand: the dialog previews his rookie deal and what it does to the cap, and Escape backs out.
  const draft = first.getByRole('button', { name: `Draft ${name}` });
  await draft.click();
  const dialog = page.getByRole('dialog', { name: `Draft ${name}?` });
  await expect(dialog).toContainText(/Total\$[\d,]+ over 4 years/);
  await expect(dialog).toContainText(/2027 cap space\$[\d,]+ to /);
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await expectTouchTargets(page, '#draftDialog', phone ? 48 : 44);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(draft).toBeFocused();
  await draft.click();
  await dialog.getByRole('button', { name: `Draft ${name}` }).click();
  await expect(dialog).toBeHidden();
  await expect(said(page)).toContainText(new RegExp(`^You drafted [A-Z]+ ${name} with the \\d+(st|nd|rd|th) pick\\. You're on the clock again with the \\d+(st|nd|rd|th) pick\\.`));
  await expect(page.locator('main h1')).toBeFocused();
  await expect(prospects(page).filter({ hasText: name })).toHaveCount(0);
  await expect(page.locator('main section.card', { hasText: 'Every pick' })).toContainText(name);
  await expect(clock).toContainText(/Round 2, pick \d+/);
  if (phone) await largeText(page);

  // The rounds: the next round's picks, the user's to come.
  await page.selectOption('#draft-round', '2');
  await expect(page.locator('#draft-round')).toBeFocused();
  await expect(status).toHaveText('Round 2: 32 picks.');

  // The staff's pick: a double-click makes just one.
  await clock.getByRole('button', { name: 'Let your staff pick' }).dblclick();
  await expect(said(page)).toContainText(/^Your staff drafted [A-Z]+ .+ with the \d+(st|nd|rd|th) pick\. You're on the clock again with the \d+(st|nd|rd|th) pick\./);
  await expect(clock).toContainText(/Round 3, pick \d+/);

  // The rest on auto, after backing out once.
  const rest = clock.getByRole('button', { name: 'Auto-draft the rest' });
  await rest.click();
  const auto = page.getByRole('dialog', { name: 'Auto-draft the rest' });
  await expect(auto.getByRole('list', { name: 'Your picks left' }).getByRole('listitem')).toHaveCount(5);
  await auto.getByRole('button', { name: 'Cancel' }).click();
  await expect(rest).toBeFocused();
  await rest.click();
  await auto.getByRole('button', { name: 'Auto-draft 5 picks' }).click();
  await expect(said(page)).toContainText(/^Your staff made your 5 picks left\. The draft is over: the media give your class [A-D]( plus| minus)?\./);

  // The class and the media's grades.
  const mine = page.locator('main section.card', { hasText: 'Your 2027 class' });
  await expect(mine.getByRole('list', { name: 'Your draft class' }).getByRole('listitem')).toHaveCount(7);
  await expect(mine).toContainText(name);
  const grades = page.locator('main section.card', { hasText: "The media's grades" });
  await expect(grades.locator('tbody tr, .roster-list > li').filter({ visible: true })).toHaveCount(32);
  await expect(page.locator('main section.card', { hasText: 'The 2028 draft' })).toContainText('Round 1');
  await expectNoHorizontalOverflow(page);
  await expectRegionsMatchOverflow(page);
  await expectTouchTargets(page, 'main', phone ? 48 : 44);
  if (phone) await largeText(page);

  // Now the league moves on.
  await goTo(page, '#/', 'Team hub');
  await expect(hub).toContainText('The draft is over');
  await hub.getByRole('button', { name: 'Advance to Undrafted free agents' }).click();
  await expect(hub.locator('.hero-title')).toHaveText('Undrafted free agents', { timeout: 60_000 });
}); // prettier-ignore

// Before the draft: the user's picks in it, not yet numbered.
test('lists your picks before the draft', async ({ page }, info) => {
  test.skip(info.project.name.endsWith('tablet'), 'Phone and desktop cover it.');
  await importLeagueFixture(page, SEASON_FIXTURE, SEASON_FIXTURE_NAME);
  await goTo(page, '#/draft', 'Draft room');
  await expect(page.locator('main .nameplate-tag')).toHaveText('2027 draft');
  const next = page.locator('main section.card', { hasText: 'The 2027 draft' });
  await expect(next.getByRole('list', { name: 'Your picks in the 2027 draft' }).getByRole('listitem')).toHaveCount(7);
  await expect(next).toContainText('The order is set when the 2026 season ends');
  await expect(next.getByRole('link', { name: 'Scouting' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectTouchTargets(page, 'main', sizeOf(info) === 'phone' ? 48 : 44);
}); // prettier-ignore
