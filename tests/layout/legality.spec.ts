import { expect, test, type Page } from '@playwright/test';
import { SEASON_FIXTURE, SEASON_FIXTURE_NAME } from './global-setup';
import { expectNoHorizontalOverflow, expectTouchTargets, goTo, importLeagueFixture, sizeOf } from './helpers';

/** Releases a receiver on the active roster, a deep position, through the roster's move dialog. */
async function releaseOne(page: Page): Promise<string> {
  await goTo(page, '#/roster', 'Roster');
  const rows = page
    .locator('main .roster-list > li, main .roster-table tbody tr')
    .filter({ visible: true })
    .filter({ has: page.locator('td, .pos').filter({ hasText: /^WR$/ }) })
    .filter({ hasNotText: /Practice squad|Injured reserve/ });
  const name = (await rows.last().locator('a').first().textContent()) ?? '';
  await page
    .getByRole('button', { name: `Moves for ${name}` })
    .first()
    .click();
  const moves = page.locator('#rosterMovesDialog');
  await moves.getByRole('radio', { name: 'Release him' }).check();
  await moves.getByRole('button', { name: `Release ${name}` }).click();
  await expect(moves).toBeHidden();
  return name;
}

// D-46: a week waits for a legal roster, with the fixes a tap away on the hub.
test('stops the week for a short roster and fixes it from the hub', async ({ page }, info) => {
  test.setTimeout(180_000);
  const phone = sizeOf(info) === 'phone';
  await importLeagueFixture(page, SEASON_FIXTURE, SEASON_FIXTURE_NAME);
  await releaseOne(page);
  await goTo(page, '#/', 'Team hub');
  const card = page.locator('main section.card', { hasText: 'Before you can advance' });
  await expect(card).toContainText('You have 52 players on the active roster; teams must carry 53.');
  await expectNoHorizontalOverflow(page);
  await expectTouchTargets(page, 'main', phone ? 48 : 44);

  // Playing the week is stopped, with the reason.
  await page.getByRole('button', { name: /^Play week \d+$/ }).click();
  await expect(page.locator('main [role="status"]').last()).toContainText('teams must carry 53', { timeout: 60_000 });
  await expect(page.locator('main .hub-date')).toHaveText('2026 season · Week 7');

  // A fix is previewed before it's made, and the card leaves once the roster is legal.
  const fix = card.getByRole('button', { name: /^(Promote|Sign) / }).first();
  const label = (await fix.getAttribute('aria-label')) ?? '';
  await fix.click();
  const dialog = page.locator('#fixDialog');
  await expect(dialog.locator('output')).toContainText('Active roster');
  await expect(dialog.locator('output')).toContainText('53 of 53');
  await dialog.getByRole('button', { name: label }).click();
  await expect(dialog).toBeHidden();
  await expect(card).toBeHidden();
}); // prettier-ignore

test("lets the staff fix it, and turns rule enforcement off with League health", async ({ page }, info) => {
  test.skip(info.project.name.endsWith('tablet'), 'Phone and desktop cover it.');
  test.setTimeout(180_000);
  await importLeagueFixture(page, SEASON_FIXTURE, SEASON_FIXTURE_NAME);
  await releaseOne(page);
  await releaseOne(page);
  await goTo(page, '#/', 'Team hub');
  const card = page.locator('main section.card', { hasText: 'Before you can advance' });
  await expect(card).toContainText('You have 51 players on the active roster');
  await card.getByRole('button', { name: 'Let your staff fix it' }).click();
  const staff = page.getByRole('dialog', { name: 'Let your staff fix it' });
  // At least the two signings the roster needs, each listed before it's made.
  const planned = staff.getByRole('list', { name: 'Moves your staff would make' }).getByRole('listitem');
  await expect(planned.first()).toBeVisible();
  const count = await planned.count();
  expect(count).toBeGreaterThanOrEqual(2);
  await staff.getByRole('button', { name: `Make ${count} moves` }).click();
  await expect(staff).toBeHidden();
  await expect(card).toBeHidden();

  // With rule enforcement off the roster can run short, and League health says so.
  await goTo(page, '#/settings', 'Settings');
  const rules = page.locator('main section.card', { hasText: 'League rules' });
  await expect(rules).toContainText('Every team follows the league rules.');
  const enforce = rules.getByRole('switch', { name: 'Rule enforcement' });
  await expect(enforce).toHaveAttribute('aria-checked', 'true');
  await enforce.click();
  await expect(enforce).toHaveAttribute('aria-checked', 'false');
  await expect(enforce).toBeFocused();
  await releaseOne(page);
  await goTo(page, '#/', 'Team hub');
  await expect(page.locator('main section.card', { hasText: 'Before you can advance' })).toHaveCount(0);
  await goTo(page, '#/settings', 'Settings');
  await expect(rules.getByRole('list', { name: 'Teams breaking league rules' })).toContainText('52 active players, short of the minimum of 53');
  await expectNoHorizontalOverflow(page);
}); // prettier-ignore
