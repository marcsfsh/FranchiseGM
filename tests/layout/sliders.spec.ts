import { expect, test } from '@playwright/test';
import { SEASON_FIXTURE, SEASON_FIXTURE_NAME } from './global-setup';
import { expectNoHorizontalOverflow, expectTouchTargets, goTo, importLeagueFixture, sizeOf } from './helpers';

// M9: the game sim and stat sliders in Settings (spec 22.3).
test('sets sliders by keyboard for your team and AI teams, keeps them, and resets them', async ({ page }, info) => {
  const phone = sizeOf(info) === 'phone';
  await importLeagueFixture(page, SEASON_FIXTURE, SEASON_FIXTURE_NAME);
  await goTo(page, '#/settings', 'Settings');
  const card = page.locator('main section.card', { hasText: 'Game sim and stat sliders' });
  await expect(card.locator('details.slider-group[open] input[type="range"]')).toHaveCount(7);
  const home = card.getByRole('slider', { name: 'Home field strength' });
  await expect(home).toHaveAttribute('aria-valuetext', '100%');
  await home.focus();
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowLeft');
  await expect(home).toHaveAttribute('aria-valuetext', '80%');
  await expect(card.locator('[role="status"]')).toHaveText('Home field strength: 80%.');

  // Gameplay sliders come in pairs: the user's team and AI teams.
  await card.locator('summary', { hasText: 'Gameplay' }).click();
  const accuracy = card.getByRole('group', { name: 'Field goal accuracy' });
  await expect(accuracy.getByRole('slider')).toHaveCount(2);
  const mine = accuracy.getByRole('slider', { name: 'Your team' });
  await mine.focus();
  await page.keyboard.press('ArrowRight');
  await expect(mine).toHaveAttribute('aria-valuetext', '105%');
  await expect(accuracy.getByRole('slider', { name: 'AI teams' })).toHaveAttribute('aria-valuetext', '100%');
  await expectNoHorizontalOverflow(page);
  await expectTouchTargets(page, 'main section.card', phone ? 48 : 44);

  // The values belong to the league: they're there when Settings opens again.
  await goTo(page, '#/', 'Team hub');
  await goTo(page, '#/settings', 'Settings');
  await expect(card.getByRole('slider', { name: 'Home field strength' })).toHaveAttribute('aria-valuetext', '80%');
  await card.getByRole('button', { name: 'Reset every slider to 100%' }).click();
  await expect(card.getByRole('slider', { name: 'Home field strength' })).toHaveAttribute('aria-valuetext', '100%');
  await expect(card.getByRole('button', { name: 'Reset every slider to 100%' })).toBeFocused();
  await expect(card.locator('[role="status"]')).toHaveText('Every slider is back to 100%.');
}); // prettier-ignore
