import { expect, test, type Page } from '@playwright/test';
import { createLeague, expectNoHorizontalOverflow, expectTouchTargets, openGame } from './helpers';

const rosterLine = (page: Page) => page.locator('main p', { hasText: 'on the active roster' });

// M8: roster moves, free agency, the cap sheet, and the contract view (spec 11.2, 12.1, 19.4).
test('signs, releases, and reads the cap without ever reaching an illegal roster', async ({ page }, info) => {
  const phone = info.project.name.endsWith('phone');
  const target = phone ? 48 : 44;
  await openGame(page);
  await createLeague(page, { name: 'Cap league', team: 'SF', seed: '31' });

  // Free agency with a full roster: an offer shows why it can't be made, and Send offer stays off.
  await page.evaluate(() => (location.hash = '#/free-agency'));
  await expect(page.locator('main h1')).toHaveText('Free agency');
  await expect(page.locator('main')).toContainText('53 of 53 on the active roster');
  // A table where there's room, a list on phones.
  // Free agents the user can make an offer to (not a player the user just released, for one).
  const agents = page
    .locator('.fa-list > li, table.fa-table tbody tr')
    .filter({ visible: true })
    .filter({ has: page.getByRole('button', { name: /^Make an offer to / }) });
  await expect(agents.first()).toBeVisible();
  const firstName = (await agents.first().locator('a').textContent()) ?? '';
  await page.getByRole('button', { name: `Make an offer to ${firstName}` }).click();
  const offer = page.locator('#offerDialog');
  await expect(offer).toBeVisible();
  await expect(offer.locator('output')).toContainText('Your active roster is full (53)');
  await expect(offer.getByRole('button', { name: 'Send offer' })).toBeDisabled();
  await expectNoHorizontalOverflow(page);
  await offer.getByRole('button', { name: 'Cancel' }).click();
  await expect(offer).toBeHidden();

  // The position filter narrows the list and keeps focus on itself.
  await page.selectOption('#fa-group', 'QB');
  await expect(page.locator('#fa-group')).toBeFocused();
  await expect(page.locator('main [role="status"]')).toContainText('among the quarterbacks');
  await page.selectOption('#fa-group', 'all');
  await expectTouchTargets(page, 'main', target);

  // Release the last player on the roster: the preview shows the cap effect before confirming.
  await page.evaluate(() => (location.hash = '#/roster'));
  await expect(page.locator('main h1')).toHaveText('Roster');
  const rows = phone ? page.locator('.roster-list > li') : page.locator('.roster-table tbody tr');
  const cutRow = rows.nth(52);
  const cutName = (await cutRow.locator('a').first().textContent()) ?? '';
  await page
    .getByRole('button', { name: `Moves for ${cutName}` })
    .first()
    .click();
  const moves = page.locator('#rosterMovesDialog');
  await expect(moves).toBeVisible();
  // Nothing is chosen at first: Confirm is off, and focus starts on Cancel (style guide 7.1).
  await expect(moves.getByRole('radio', { name: 'Release him' })).not.toBeChecked();
  await expect(moves.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await expect(moves.getByRole('button', { name: 'Confirm move' })).toBeDisabled();
  await moves.getByRole('radio', { name: 'Release him' }).check();
  await expect(moves.locator('output')).toContainText('2026 cap space');
  await expect(moves.locator('output')).toContainText(/goes on waivers|becomes a free agent/);
  // Injured reserve is only for a player too hurt to play.
  await moves.getByRole('radio', { name: 'Place him on injured reserve' }).check();
  await expect(moves.locator('output')).toContainText(
    'Only a player too hurt to play can go on injured reserve.'
  );
  await expect(moves.getByRole('button', { name: `Place ${cutName} on injured reserve` })).toBeDisabled();
  await moves.getByRole('radio', { name: 'Release him' }).check();
  await moves.getByRole('button', { name: `Release ${cutName}` }).click();
  await expect(moves).toBeHidden();
  await expect(page.locator('.toast').last()).toContainText(cutName);
  await expect(rosterLine(page)).toContainText('52 of 53 on the active roster');
  await expectNoHorizontalOverflow(page);

  // Two practice squad players can be elevated for a game; a third is refused, with the reason.
  const squad = phone
    ? page.locator('.roster-list > li', { hasText: 'Practice squad' })
    : page.locator('.roster-table tbody tr', { hasText: 'Practice squad' });
  for (let i = 0; i < 3; i++) {
    const name = (await squad.nth(i).locator('a').first().textContent()) ?? '';
    await page
      .getByRole('button', { name: `Moves for ${name}` })
      .first()
      .click();
    await moves.getByRole('radio', { name: "Elevate him for this week's game" }).check();
    if (i < 2) {
      await moves.getByRole('button', { name: `Elevate ${name}` }).click();
      await expect(moves).toBeHidden();
    } else {
      await expect(moves.locator('output')).toContainText('You can elevate 2 players a game.');
      await expect(moves.getByRole('button', { name: `Elevate ${name}` })).toBeDisabled();
      await moves.getByRole('button', { name: 'Cancel' }).click();
    }
  }

  // Over the cap, an offer shows the cap hit against the space left, and Send offer stays off.
  type Gm = { __gm: { app: { league: { teams: Record<string, { carryover: number }> } } } };
  const setCarryover = (amount: number) =>
    page.evaluate(n => ((globalThis as unknown as Gm).__gm.app.league.teams.SF!.carryover = n), amount);
  await setCarryover(-400_000_000);
  await page.evaluate(() => (location.hash = '#/free-agency'));
  await expect(page.locator('main h1')).toHaveText('Free agency');
  const overName = (await agents.first().locator('a').textContent()) ?? '';
  await page.getByRole('button', { name: `Make an offer to ${overName}` }).click();
  await expect(offer.locator('output')).toContainText(
    /cap hit of \$[\d,]+ is more than your \$0 of cap space/
  );
  await expect(offer.getByRole('button', { name: 'Send offer' })).toBeDisabled();
  await offer.getByRole('button', { name: 'Cancel' }).click();
  await setCarryover(0);
  await page.evaluate(() => (location.hash = '#/roster'));
  await expect(page.locator('main h1')).toHaveText('Roster');

  // Now an offer at his asking price goes through; a lower one says what he wants.
  await page.evaluate(() => (location.hash = '#/free-agency'));
  await expect(page.locator('main h1')).toHaveText('Free agency');
  const signName = (await agents.first().locator('a').textContent()) ?? '';
  await page.getByRole('button', { name: `Make an offer to ${signName}` }).click();
  await expect(offer.getByRole('button', { name: 'Send offer' })).toBeEnabled();
  const ask = Number(await page.locator('#offer-salary').inputValue());
  await page.fill('#offer-salary', String(ask - 100_000));
  await expect(offer.getByRole('button', { name: 'Send offer' })).toBeDisabled();
  // Under his minimum the salary field says so; above it but under his ask, the preview says what he wants.
  const salaryError = page.locator('#offer-salary-error');
  if (await salaryError.isVisible()) {
    await expect(salaryError).toContainText('His minimum salary is');
    await expect(page.locator('#offer-salary')).toHaveAttribute('aria-invalid', 'true');
  } else await expect(offer.locator('output')).toContainText(/He wants at least \$[\d,]+ a year\./);
  await page.fill('#offer-salary', String(ask));
  await page.selectOption('#offer-years', '2');
  await expect(offer.locator('.hint', { hasText: 'Total:' })).toContainText('over 2 years');
  await offer.getByRole('button', { name: 'Send offer' }).click();
  await expect(offer).toBeHidden();
  await expect(page.locator('.toast').last()).toContainText(`${signName} signs for 2 years.`);
  await expect(page.locator('main')).toContainText('53 of 53 on the active roster');

  // The cap sheet by league year: the released player's charge shows as dead money.
  await page.evaluate(() => (location.hash = '#/finances'));
  await expect(page.locator('main h1')).toHaveText('Salary cap');
  await expect(page.getByRole('tab', { name: '2026' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('main')).toContainText('Cap space');
  await expect(page.locator('main table').first()).toContainText(signName);
  await expectNoHorizontalOverflow(page);
  await page.getByRole('tab', { name: '2027' }).click();
  await expect(page.getByRole('tab', { name: '2027' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('main')).toContainText('2027 cap');
  await expectTouchTargets(page, 'main', target);

  // The new signing's contract, year by year, with his roster moves.
  await page.evaluate(() => (location.hash = '#/free-agency'));
  await page.evaluate(() => (location.hash = '#/roster'));
  await page.getByRole('link', { name: signName }).first().click();
  await expect(page.locator('main h1')).toHaveText(signName);
  const contract = page.locator('main section.card', { hasText: 'Guaranteed at signing' });
  await expect(contract).toContainText('Total');
  await expect(contract.locator('table tbody tr')).toHaveCount(2);
  await expect(contract.getByRole('button', { name: 'Roster moves' })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  // The smallest phone with text at 200%: no sideways page scroll, and a dialog keeps its actions in view.
  if (phone) {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
    const screens: [string, string][] = [
      ['#/free-agency', 'Free agency'],
      ['#/finances', 'Salary cap'],
      ['#/roster', 'Roster']
    ];
    for (const [hash, title] of screens) {
      await page.evaluate(h => (location.hash = h), hash);
      await expect(page.locator('main h1')).toHaveText(title);
      await expectNoHorizontalOverflow(page);
    }
    // The signing's toasts can still cover much of this small screen, and they wait while the pointer is
    // over them: dismiss them first, as the user would.
    await page.evaluate(() =>
      document
        .querySelectorAll<HTMLButtonElement>('.toast-region .toast button[aria-label^="Dismiss"]')
        .forEach(b => b.click())
    );
    await expect(page.locator('.toast-region .toast')).toHaveCount(0);
    await page.locator('.roster-list .list-row .btn-row button').first().click();
    await expect(moves).toBeVisible();
    const body = moves.locator('.dialog-body');
    expect(await body.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    const cancel = await moves.getByRole('button', { name: 'Cancel' }).boundingBox();
    expect((cancel?.y ?? 9999) + (cancel?.height ?? 0)).toBeLessThanOrEqual(568);
    await moves.getByRole('button', { name: 'Cancel' }).click();
    await page.evaluate(() => (document.documentElement.style.fontSize = ''));
  }
});
