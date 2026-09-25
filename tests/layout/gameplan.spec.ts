import { expect, test } from '@playwright/test';
import { createLeague, expectNoHorizontalOverflow, expectTouchTargets, openGame } from './helpers';

// M7 and M9: the game plan with the scouting report, dials, balance by situation, and player focus (spec 8.7).
test('shows the scouting report and sets the plan by keyboard', async ({ page }, info) => {
  const phone = info.project.name.endsWith('phone');
  await openGame(page);
  await createLeague(page, { name: 'Plan league', team: 'SF', seed: '31' });
  await page.evaluate(() => (location.hash = '#/game-plan'));
  await expect(page.locator('main h1')).toHaveText('Game plan');
  await expect(page.locator('main')).toContainText(/Week 1: (against|at) the /);
  const auto = page.getByRole('switch', { name: 'Coordinators set the game plan' });
  await expect(auto).toHaveAttribute('aria-checked', 'true');
  const report = page.locator('main section.card', { hasText: 'Scouting report' });
  await expect(report.locator('dt')).toHaveCount(12);
  await expect(report).toContainText('Your passing game against their pass defense');

  // A dial by keyboard: arrow keys move through the radio group.
  const balance = page.getByRole('group', { name: 'Run and pass balance' });
  await balance.getByRole('radio', { name: 'Balanced' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(balance.getByRole('radio', { name: 'Lean pass' })).toBeChecked();
  const status = page.locator('main [role="status"]');
  await expect(status).toContainText('Run and pass balance: Lean pass.');
  await expect(status).toContainText('You now set the game plan');
  await expect(auto).toHaveAttribute('aria-checked', 'false');

  // The balance by down and situation (spec 8.7), behind a disclosure.
  await page.getByText('Set the balance by down and situation').click();
  const thirdLong = page.getByRole('group', { name: 'Third or fourth and long' });
  await expect(thirdLong.getByRole('radio', { name: 'As planned' })).toBeChecked();
  await thirdLong.getByRole('radio', { name: 'Pass more' }).check();
  await expect(status).toContainText('Third or fourth and long: Pass more.');
  await expect(page.getByRole('group', { name: 'In the red zone' }).getByRole('radio')).toHaveCount(5);

  // Player focus.
  await page.locator('#focus-feature').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Apply player focus' }).click();
  await expect(status).toContainText(/^Feature: /);
  await page.getByLabel('Spy their quarterback').focus();
  await page.keyboard.press('Space');
  await expect(status).toContainText('A spy will shadow their quarterback.');
  await expectNoHorizontalOverflow(page);
  await expectTouchTargets(page, 'main', phone ? 48 : 44);

  // The plan is saved with the league: it's still there after a reload.
  await page.waitForTimeout(800);
  await page.reload();
  await expect(page.locator('main h1')).toHaveText('Game plan');
  await expect(
    page.getByRole('group', { name: 'Run and pass balance' }).getByRole('radio', { name: 'Lean pass' })
  ).toBeChecked();
  await expect(page.getByLabel('Spy their quarterback')).toBeChecked();
  await page.getByText('Set the balance by down and situation').click();
  await expect(
    page.getByRole('group', { name: 'Third or fourth and long' }).getByRole('radio', { name: 'Pass more' })
  ).toBeChecked();

  await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
  await expectNoHorizontalOverflow(page);
});
