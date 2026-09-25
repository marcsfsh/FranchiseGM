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

// Spec 10.5: training focus by unit and by player, the offseason program, and the development settings.
test('sets the weekly focus, a player focus, and the offseason program, taking training from the coaches', async ({ page }, info) => {
  const phone = sizeOf(info) === 'phone';
  await importLeagueFixture(page, SEASON_FIXTURE, SEASON_FIXTURE_NAME);
  await goTo(page, '#/game-plan', 'Game plan');
  await page.getByRole('link', { name: 'Set training', exact: true }).click();
  await expect(page.locator('main h1')).toHaveText('Training');
  const status = page.locator('main [role="status"]').last();
  const coaches = page.getByRole('switch', { name: 'Coaches set training' });
  await expect(coaches).toHaveAttribute('aria-checked', 'true');
  await expectNoHorizontalOverflow(page);
  await expectRegionsMatchOverflow(page);
  await expectTouchTargets(page, 'main', phone ? 48 : 44);

  // The weekly focus changes nothing until Apply; then each player menu names his unit's new focus.
  await page.getByLabel('Offense', { exact: true }).selectOption({ label: 'Route running' });
  await expect(page.locator('#trainingUnit-offense-hint')).toContainText('short route running, medium route running');
  await page.getByRole('button', { name: 'Apply weekly focus' }).click();
  await expect(status).toHaveText('Offense: Route running. You now set training; your coaches stopped making changes.');
  await expect(coaches).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('main table option', { hasText: 'Unit: Route running' }).first()).toBeAttached();

  // Arrow keys move through the programs without applying one; Apply takes the one chosen.
  const speed = page.getByRole('radio', { name: 'Speed and agility' });
  await speed.check();
  await speed.press('ArrowDown');
  await expect(page.getByRole('radio', { name: 'Technique' })).toBeChecked();
  await expect(status).toHaveText('Offense: Route running. You now set training; your coaches stopped making changes.');
  await page.getByRole('radio', { name: 'Speed and agility' }).check();
  await page.getByRole('button', { name: 'Apply program' }).click();
  await expect(status).toHaveText('Offseason program: Speed and agility.');

  // Player focus: a count of the changes waiting, applied from above the table.
  const first = page.locator('main table tbody tr').first().getByRole('combobox');
  await first.selectOption({ label: 'Film study' });
  await expect(page.locator('#playerFocusPending')).toHaveText('1 change to apply.');
  await page.getByRole('button', { name: 'Apply player focus' }).first().click();
  await expect(status).toHaveText('Player focus set for 1 player.');
  await expect(page.locator('#playerFocusPending')).toHaveText('No changes to apply.');

  // Back from a player's page: the same place, with focus on his link.
  const link = page.locator('main table tbody tr').first().getByRole('link');
  const name = (await link.textContent()) ?? '';
  await link.click();
  await expect(page.locator('main h1')).toContainText(name);
  await page.goBack();
  await expect(page.locator('main h1')).toHaveText('Training');
  await expect(page.locator('main table tbody tr').first().getByRole('link')).toBeFocused();

  // It all stays through a visit elsewhere.
  await goTo(page, '#/roster', 'Roster');
  await goTo(page, '#/training', 'Training');
  await expect(page.getByLabel('Offense', { exact: true })).toHaveValue('routeRunning');
  await expect(page.getByRole('radio', { name: 'Speed and agility' })).toBeChecked();
  await expect(page.locator('main table tbody tr').first().getByRole('combobox')).toHaveValue('filmStudy');
  await expect(coaches).toHaveAttribute('aria-checked', 'false');
}); // prettier-ignore

test('changes, sorts, and resets the development settings', async ({ page }, info) => {
  const phone = sizeOf(info) === 'phone';
  await importLeagueFixture(page, SEASON_FIXTURE, SEASON_FIXTURE_NAME);
  await goTo(page, '#/settings', 'Settings');
  const card = page.locator('main section.card', { hasText: 'Development' });
  const status = card.locator('[role="status"]');
  await card.getByLabel('Players retire').selectOption({ label: '2 years later' });
  await expect(status).toHaveText('Players retire 2 years later.');
  const speed = card.getByRole('slider', { name: 'Regression speed by age' });
  await speed.focus();
  await page.keyboard.press('ArrowRight');
  await expect(speed).toHaveAttribute('aria-valuetext', '105%');
  await card.locator('summary', { hasText: 'By age' }).click();
  await card.locator('summary', { hasText: 'By position' }).click();
  const cell = card.getByRole('spinbutton', { name: 'Progression, ages 23 to 24, percent' });
  await cell.fill('150');
  await cell.press('Tab');
  await expect(status).toHaveText('Progression, ages 23 to 24: 150%.');

  // An empty entry is refused and the value stays; one past the limit comes back to it.
  const old = card.getByRole('spinbutton', { name: 'Regression, ages 35 and over, percent' });
  await old.fill('');
  await old.press('Tab');
  await expect(status).toHaveText('Regression, ages 35 and over: enter a whole number from 0 to 200. It stays at 100%.');
  await expect(old).toHaveAttribute('aria-invalid', 'true');
  await expect(old).toHaveAccessibleDescription('Enter a whole number from 0 to 200.');
  await old.fill('250');
  await old.press('Tab');
  await expect(status).toHaveText('Regression, ages 35 and over: 200%, the most allowed.');
  await expect(old).not.toHaveAttribute('aria-invalid', 'true');

  // A sort reads the values as edited.
  const ages = card.locator('table', { hasText: '23 to 24' });
  await ages.getByRole('button', { name: /^Progression/ }).click();
  await expect(ages.locator('tbody tr').first().locator('th')).toHaveText('23 to 24');

  await expectNoHorizontalOverflow(page);
  await expectRegionsMatchOverflow(page);
  await expectTouchTargets(page, 'main', phone ? 48 : 44);
  // Large text reflows with both tables open, down to 320 pixels wide.
  await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
  await expectNoHorizontalOverflow(page);
  if (phone) {
    await page.setViewportSize({ width: 320, height: 640 });
    await expectNoHorizontalOverflow(page);
  }
  await page.evaluate(() => (document.documentElement.style.fontSize = ''));

  await card.getByRole('button', { name: 'Reset development to normal' }).click();
  const dialog = page.getByRole('dialog', { name: 'Reset development' });
  await dialog.getByRole('button', { name: /^Reset \d+ settings?$/ }).click();
  await expect(status).toHaveText('Every development setting is back to normal.');
  await expect(card.getByRole('button', { name: 'Reset development to normal' })).toBeFocused();
  await expect(card.getByLabel('Players retire')).toHaveValue('0');
}); // prettier-ignore
