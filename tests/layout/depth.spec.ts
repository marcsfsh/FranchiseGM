import { expect, test } from '@playwright/test';
import { createLeague, expectNoHorizontalOverflow, expectTouchTargets, openGame } from './helpers';

// M7 and M9: the depth chart with keyboard moves, dragging, the head coach's suggestions, the auto switch, and
// packages (spec 12.2, 12.3, 19.3, style 7.4).
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
  // Each position is a column with its starter menu above its list, and the rows of columns side by side
  // line up whatever each column holds (the Checkpoint A review).
  const menu = await page.locator('[data-slot="QB"] .depth-pick').boundingBox();
  const list = await page.locator('[data-slot="QB"] .depth-list').boundingBox();
  expect(menu && list && menu.y + menu.height <= list.y).toBe(true);
  const rowTops = await page.evaluate(() => {
    const groups = [...document.querySelectorAll<HTMLElement>('.depth-group')].filter(g => g.offsetParent);
    const top = groups[0]?.getBoundingClientRect().top ?? 0;
    return groups
      .filter(g => Math.abs(g.getBoundingClientRect().top - top) < 1)
      .map(g => [...g.querySelectorAll('.depth-slot')].map(li => Math.round(li.getBoundingClientRect().top)));
  });
  if (info.project.name.endsWith('desktop')) expect(rowTops.length).toBeGreaterThan(1);
  for (let i = 0; i < Math.min(...rowTops.map(t => t.length)); i++)
    expect(new Set(rowTops.map(t => t[i])).size, `row ${i + 1} lines up`).toBe(1);
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

  // With the chart in the user's hands, the head coach suggests where he'd start someone else.
  await page.getByRole('button', { name: `Move ${first} down at quarterback` }).click();
  const advice = page.locator('main section.card', { hasText: "Your head coach's suggestions" });
  const apply = advice.getByRole('button', { name: `Start ${first} at quarterback` });
  await expect(apply).toBeVisible();
  await apply.click();
  await expect(quarterbacks.nth(0).locator('a')).toHaveText(first);
  await expect(advice.getByRole('button', { name: `Start ${first} at quarterback` })).toHaveCount(0);

  // Dragging a row by its handle moves him too (a pointer shortcut beside Up and Down).
  const handle = quarterbacks.nth(1).locator('.drag-handle');
  const target = quarterbacks.nth(0);
  // Both rows on screen: the mouse works in viewport coordinates.
  await page.evaluate(() => document.querySelector('[data-slot="QB"]')?.scrollIntoView({ block: 'center' }));
  const from = await handle.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error('no rows to drag');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + 4, { steps: 5 });
  await page.mouse.up();
  await expect(quarterbacks.nth(0).locator('a')).toHaveText(second);
  await expect(page.locator('main [role="status"]')).toContainText(`${second} is first at quarterback.`);
  await page.getByRole('button', { name: `Move ${second} down at quarterback` }).click();
  await expect(quarterbacks.nth(0).locator('a')).toHaveText(first);

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

  // A questionable player plays hurt unless the user rests him (spec 10.8).
  const hurt = await page.evaluate(() => {
    type P = { id: string; team: string | null; status: string; position: string; firstName: string; lastName: string; injury: unknown };
    const app = (globalThis as unknown as { __gm: { app: { league: { players: Record<string, P> } } } }).__gm.app;
    const qb = Object.values(app.league.players).find(p => p.team === 'SF' && p.status === 'active' && p.position === 'WR') as P;
    qb.injury = { bodyPart: 'ankle', severity: 'minor', weeksOut: 0, lingering: 3, fragile: 0, season: 2026, week: 1, career: false };
    return `${qb.firstName} ${qb.lastName}`;
  }); // prettier-ignore
  await page.evaluate(() => (location.hash = '#/'));
  await page.evaluate(() => (location.hash = '#/depth-chart'));
  const rest = page.getByLabel(new RegExp(`^Rest ${hurt} \\(WR`));
  await rest.focus();
  await page.keyboard.press('Space');
  await expect(page.locator('main [role="status"]')).toContainText(`${hurt} rests this week.`);
  await expect(rest).toBeChecked();

  // Large text reflows without sideways scrolling, down to 320 pixels wide.
  await page.getByRole('tab', { name: 'Offense' }).click();
  await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
  await expectNoHorizontalOverflow(page);
  if (phone) {
    await page.setViewportSize({ width: 320, height: 640 });
    await expectNoHorizontalOverflow(page);
  }
});
