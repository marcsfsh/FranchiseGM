import { expect, test } from '@playwright/test';
import { createLeague, expectNoHorizontalOverflow, expectTouchTargets, openGame } from './helpers';

// M7: the depth chart with keyboard moves, the auto switch, and packages (spec 12.2, 12.3, style 7.4).
test('moves players by keyboard, takes the chart back from the coach, and sets a situational sub', async ({
  page
}, info) => {
  const phone = info.project.name.endsWith('phone');
  await openGame(page);
  await createLeague(page, { name: 'Depth league', team: 'SF', seed: '31' });
  await page.evaluate(() => (location.hash = '#/depth-chart'));
  await expect(page.locator('main h1')).toHaveText('Depth chart');
  const auto = page.getByRole('switch', { name: 'Coach sets the depth chart' });
  await expect(auto).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('tab', { name: 'Offense' })).toHaveAttribute('aria-selected', 'true');

  const quarterbacks = page.locator('[data-slot="QB"] .depth-slot');
  await expect(quarterbacks.first()).toBeVisible();
  const count = await quarterbacks.count();
  const first = (await quarterbacks.nth(0).locator('a').textContent()) ?? '';
  const second = (await quarterbacks.nth(1).locator('a').textContent()) ?? '';
  // Keyboard only: focus the starter's Move down and press Enter.
  const down = page.getByRole('button', { name: `Move ${first} down at quarterback` });
  await down.focus();
  await page.keyboard.press('Enter');
  await expect(quarterbacks.nth(0).locator('a')).toHaveText(second);
  await expect(quarterbacks.nth(1).locator('a')).toHaveText(first);
  await expect(page.locator('main [role="status"]')).toContainText(`${first} moved to 2nd at quarterback.`);
  await expect(page.locator('main [role="status"]')).toContainText('You now set the depth chart');
  // Focus stays on the moved player's same button, or his other one at the end of the list.
  const direction = count > 2 ? 'down' : 'up';
  await expect(page.getByRole('button', { name: `Move ${first} ${direction} at quarterback` })).toBeFocused();
  await expect(auto).toHaveAttribute('aria-checked', 'false');

  // The starter menu puts him back on top.
  const option = await page.locator('#starter-QB option', { hasText: first }).getAttribute('value');
  await page.selectOption('#starter-QB', option ?? '');
  // The menu changes nothing until Make first.
  await expect(quarterbacks.nth(0).locator('a')).toHaveText(second);
  await page.getByRole('button', { name: 'Make the chosen player first at quarterback' }).click();
  await expect(quarterbacks.nth(0).locator('a')).toHaveText(first);
  await expect(
    page.getByRole('button', { name: 'Make the chosen player first at quarterback' })
  ).toBeFocused();

  // Opening a player and coming back returns to the same place (style guide 7.3).
  const link = page.locator('[data-slot="QB"] .depth-slot a').first();
  const name = (await link.textContent()) ?? '';
  await link.click();
  await expect(page.locator('main h1')).toHaveText(name);
  await page.goBack();
  await expect(page.locator('main h1')).toHaveText('Depth chart');
  await expect(page.locator('[data-slot="QB"] .depth-slot a').first()).toBeFocused();

  // Arrow keys move between tabs.
  await page.getByRole('tab', { name: 'Offense' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Defense' })).toBeFocused();
  await expect(page.getByRole('tab', { name: 'Defense' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-slot="MIKE"]')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectTouchTargets(page, 'main', phone ? 48 : 44);

  // Packages and rotations: a third-down back.
  await page.getByRole('tab', { name: 'Packages and rotations' }).click();
  const back = page.locator('#sub-thirdDownBack');
  await back.selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Apply situational subs' }).click();
  await expect(page.locator('main [role="status"]')).toContainText('is your third-down back.');
  // Adding a snap limit keeps focus on its row's Remove button.
  await page.getByRole('button', { name: 'Add snap limit' }).click();
  await expect(page.locator('main [role="status"]')).toContainText('at most');
  await expect(page.locator('[id^="snapLimits-remove-"]')).toBeFocused();
  await expectNoHorizontalOverflow(page);
  await expectTouchTargets(page, 'main', phone ? 48 : 44);

  // Handing it back to the coach.
  await auto.click();
  await expect(auto).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('main [role="status"]')).toContainText(
    'Your head coach will set the depth chart'
  );

  // Large text reflows without sideways scrolling, down to 320 pixels wide.
  await page.getByRole('tab', { name: 'Offense' }).click();
  await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
  await expectNoHorizontalOverflow(page);
  if (phone) {
    await page.setViewportSize({ width: 320, height: 640 });
    await expectNoHorizontalOverflow(page);
  }
});
