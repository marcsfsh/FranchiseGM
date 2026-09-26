import { expect, test, type Locator, type Page } from '@playwright/test';
import { FINISHED_FIXTURE, FINISHED_FIXTURE_NAME, SEASON_FIXTURE, SEASON_FIXTURE_NAME } from './global-setup';
import {
  expectNoHorizontalOverflow,
  expectRegionsMatchOverflow,
  expectTouchTargets,
  goTo,
  importLeagueFixture,
  sizeOf
} from './helpers';

/** A card's rows as shown: the table on wider screens, the list on phones. */
const rowsOf = (card: Locator, phone: boolean): Locator =>
  phone ? card.locator('.roster-list > li') : card.locator('tbody tr');
const nameIn = async (row: Locator): Promise<string> =>
  (await row.getByRole('link').first().textContent()) ?? '';
const section = (page: Page, title: string): Locator => page.locator('main section.card', { hasText: title });

// Spec 11.4 and 11.5: the re-sign window's extensions, tags, tenders, and fifth-year options.
test('extends, tags, and exercises an option in the re-sign window, each move previewed first', async ({ page }, info) => {
  test.skip(info.project.name.endsWith('tablet'), 'Phone and desktop cover it.');
  test.setTimeout(180_000);
  const phone = sizeOf(info) === 'phone';
  await importLeagueFixture(page, FINISHED_FIXTURE, FINISHED_FIXTURE_NAME);
  const hub = section(page, 'The offseason');
  await page.getByRole('button', { name: 'Advance to Awards and Hall of Fame' }).click();
  await expect(hub.locator('.hero-title')).toHaveText('Awards and Hall of Fame', { timeout: 60_000 });
  await page.getByRole('button', { name: 'Advance to Re-sign window' }).click();
  await expect(hub.locator('.hero-title')).toHaveText('Re-sign window', { timeout: 60_000 });
  await hub.getByRole('link', { name: 'Contracts' }).click();
  await expect(page.locator('main h1')).toHaveText('Contracts');
  await expectNoHorizontalOverflow(page);
  await expectRegionsMatchOverflow(page);
  await expectTouchTargets(page, 'main', phone ? 48 : 44);

  // Escape closes a dialog and returns focus to its Decide button.
  const expiring = section(page, 'Expiring contracts');
  const decided = section(page, 'Decided this year');
  await expect(decided).toContainText('No extensions, tags, tenders, or options yet this league year.');
  const first = rowsOf(expiring, phone).first();
  const name = await nameIn(first);
  const decide = first.getByRole('button', { name: `Decide on ${name}` });
  await decide.click();
  const dialog = page.getByRole('dialog', { name: `Keep ${name}` });
  await expectTouchTargets(page, '#resignDialog', phone ? 48 : 44);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(decide).toBeFocused();

  // An extension: its total, then its cost on next year's cap, then focus on the next player's button.
  await decide.click();
  await dialog.getByRole('radio', { name: 'Offer an extension' }).check();
  await expect(dialog.getByText(/^Total: \$[\d,]+ over 3 years\. AAV: \$[\d,]+\. Guaranteed: \$0\.$/)).toBeVisible();
  await expect(dialog).toContainText(/His agent asks for \$[\d,]+ a year over 3 years to stay, and comes down as you talk\./);
  await expect(dialog.locator('output')).toContainText('2027');
  await dialog.getByLabel('Salary each year, dollars').fill('1000');
  await expect(dialog.getByLabel('Salary each year, dollars')).toHaveAttribute('aria-invalid', 'true');
  await expect(dialog.getByRole('button', { name: `Extend ${name}` })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(decide).toBeFocused();
  await decide.click();
  await dialog.getByRole('radio', { name: 'Offer an extension' }).check();
  await dialog.getByRole('button', { name: `Extend ${name}` }).click();
  await expect(dialog).toBeHidden();
  await expect(rowsOf(decided, phone).filter({ hasText: name })).toContainText('Extension, 3 years');
  await expect(expiring.getByRole('link', { name, exact: true })).toHaveCount(0);
  await expect(rowsOf(expiring, phone).first().getByRole('button', { name: /^Decide on / })).toBeFocused();

  // A tag for next year, one a year: a second is refused in its preview.
  const second = rowsOf(expiring, phone).first();
  const tagged = await nameIn(second);
  await second.getByRole('button', { name: `Decide on ${tagged}` }).click();
  const tagDialog = page.getByRole('dialog', { name: `Keep ${tagged}` });
  await tagDialog.getByRole('radio', { name: /^Transition tag: \$[\d,]+ for 2027$/ }).check();
  await expect(tagDialog.locator('output')).toContainText('fully guaranteed');
  await tagDialog.getByRole('button', { name: `Tag ${tagged}` }).click();
  await expect(tagDialog).toBeHidden();
  await expect(rowsOf(decided, phone).filter({ hasText: tagged })).toContainText('Transition tag');
  const third = rowsOf(expiring, phone).first();
  const other = await nameIn(third);
  await third.getByRole('button', { name: `Decide on ${other}` }).click();
  const refused = page.getByRole('dialog', { name: `Keep ${other}` });
  await refused.getByRole('radio', { name: /^Exclusive franchise tag/ }).check();
  await expect(refused.locator('output')).toHaveText('You can tag one player a year, and you already have.');
  await expect(refused.getByRole('button', { name: `Tag ${other}` })).toBeDisabled();
  await refused.getByRole('button', { name: 'Cancel' }).click();

  // A fifth-year option: priced by tier, exercised for a guaranteed fifth year.
  const options = section(page, 'Fifth-year options');
  const pick = rowsOf(options, phone).first();
  const picked = await nameIn(pick);
  await pick.getByRole('button', { name: `Decide on ${picked}` }).click();
  const option = page.getByRole('dialog', { name: `${picked}'s fifth-year option` });
  await expect(option).toContainText(/level: \$[\d,]+ for 2028, fully guaranteed once exercised\./);
  await option.getByRole('radio', { name: 'Exercise his option' }).check();
  await option.getByRole('button', { name: `Exercise ${picked}'s option` }).click();
  await expect(option).toBeHidden();
  await expect(rowsOf(decided, phone).filter({ hasText: picked })).toContainText(/Fifth-year option exercised.*in 2028/i);

  // The window's message waits in the inbox; large text reflows, and a dialog stays usable on a small phone.
  await goTo(page, '#/inbox', 'Inbox');
  await expect(page.locator('main .inbox-item', { hasText: 'The re-sign window is open' })).toBeVisible();
  await goTo(page, '#/contracts', 'Contracts');
  await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
  await expectNoHorizontalOverflow(page);
  if (phone) {
    await page.setViewportSize({ width: 320, height: 568 });
    await expectNoHorizontalOverflow(page);
    const row = rowsOf(expiring, phone).first();
    await row.getByRole('button', { name: /^Decide on / }).click();
    const open = page.getByRole('dialog');
    await open.getByRole('radio', { name: 'Offer an extension' }).check();
    const cancel = open.getByRole('button', { name: 'Cancel' });
    await cancel.scrollIntoViewIfNeeded();
    await expect(cancel).toBeInViewport();
    await expectNoHorizontalOverflow(page);
    await cancel.click();
  }
}); // prettier-ignore

// Spec 22.7: the user's roster moves and contracts can go to the staff; outside the window only extensions.
test('puts contracts on auto from Settings, and offers only extensions during the season', async ({ page }, info) => {
  const phone = sizeOf(info) === 'phone';
  await importLeagueFixture(page, SEASON_FIXTURE, SEASON_FIXTURE_NAME);
  await goTo(page, '#/contracts', 'Contracts');
  await expect(page.locator('main')).toContainText('Extensions are open until the 2027 league year starts');
  await expect(section(page, 'Fifth-year options')).toContainText('Fifth-year options are decided in the re-sign window after the season.');
  await expect(section(page, 'Fifth-year options').getByRole('button', { name: /^Decide on / })).toHaveCount(0);
  const row = rowsOf(section(page, 'Expiring contracts'), phone).first();
  const name = await nameIn(row);
  await row.getByRole('button', { name: `Decide on ${name}` }).click();
  const dialog = page.getByRole('dialog', { name: `Keep ${name}` });
  await expect(dialog).toContainText('Tags and tenders open in the re-sign window.');
  // His own offer in talks, or the extension the GM settles (spec 11.6).
  await expect(dialog.getByRole('radio')).toHaveCount(2);
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await dialog.getByRole('radio', { name: 'Offer an extension' }).check();
  await expect(dialog.getByLabel('Extension length')).toBeVisible();
  // More terms wait in a disclosure: guarantees, incentives, and void years, and take it or leave it.
  await dialog.getByText('Guarantees, incentives, and void years').click();
  await dialog.getByLabel('Fully guaranteed salary').selectOption('2');
  await dialog.getByLabel('Void years').selectOption('1');
  await expect(dialog.locator('#extend-voids-error')).toHaveText('Void years only spread a signing bonus: add one, or choose none.');
  await expect(dialog.getByRole('button', { name: `Extend ${name}` })).toBeDisabled();
  await dialog.getByLabel('Signing bonus, dollars').fill('1000000');
  await expect(dialog.locator('#extend-voids-error')).toBeHidden();
  await expect(dialog.getByText(/^Total: \$[\d,]+ over 3 years\. AAV: \$[\d,]+\. Guaranteed: \$[1-9][\d,]+\.$/)).toBeVisible();
  await expect(dialog.getByRole('checkbox', { name: 'Take it or leave it' })).not.toBeChecked();
  await expectTouchTargets(page, '#resignDialog', phone ? 48 : 44);
  await expectNoHorizontalOverflow(page);
  await dialog.getByRole('radio', { name: /^Have your GM negotiate: \$[\d,]+ a year for \d years?$/ }).check();
  await expect(dialog.locator('output')).toContainText('2027');
  await dialog.getByRole('button', { name: `Extend ${name}` }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.toast').last()).toContainText(`${name} signs a`);

  await goTo(page, '#/settings', 'Settings');
  const card = section(page, 'Automation');
  const status = card.locator('[role="status"]');
  const contracts = card.getByRole('switch', { name: 'Contracts' });
  await expect(contracts).toHaveAttribute('aria-checked', 'false');
  await expect(contracts).toHaveAccessibleDescription('Extensions, tags, tenders, and fifth-year options in the re-sign window.');
  await expectTouchTargets(page, 'main section.card:has(#auto-contracts)', phone ? 48 : 44);
  await contracts.click();
  await expect(contracts).toHaveAttribute('aria-checked', 'true');
  await expect(status).toHaveText('Contracts: your staff makes them.');
  await card.getByRole('switch', { name: 'Roster moves' }).press('Space');
  await expect(status).toHaveText('Roster moves: your staff makes them.');

  // The choice is saved with the league, and the Contracts screen says who decides.
  await goTo(page, '#/contracts', 'Contracts');
  await expect(page.locator('main')).toContainText('Your staff makes your contract decisions in the re-sign window.');
  await page.getByRole('link', { name: 'Change this under Automation in Settings' }).click();
  await expect(page.locator('main h1')).toHaveText('Settings');
  await expect(section(page, 'Automation').getByRole('switch', { name: 'Contracts' })).toHaveAttribute('aria-checked', 'true');
  await expect(section(page, 'Automation').getByRole('switch', { name: 'Roster moves' })).toHaveAttribute('aria-checked', 'true');
}); // prettier-ignore
