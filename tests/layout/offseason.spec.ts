import { expect, test } from '@playwright/test';
import { FINISHED_FIXTURE, FINISHED_FIXTURE_NAME } from './global-setup';
import { expectNoHorizontalOverflow, expectTouchTargets, goTo, importLeagueFixture, sizeOf } from './helpers';

// Spec 4.1: the offseason from the Super Bowl to the next season's week 1, a step at a time or all at once.
test('walks the offseason from the hub into the next season', async ({ page }, info) => {
  test.skip(info.project.name.endsWith('tablet'), 'Phone and desktop cover it.');
  test.setTimeout(300_000);
  const phone = sizeOf(info) === 'phone';
  await importLeagueFixture(page, FINISHED_FIXTURE, FINISHED_FIXTURE_NAME);
  const card = page.locator('main section.card', { hasText: 'The offseason' });
  const status = page.locator('main [role="status"]').last();
  await expect(card.locator('.hero-title')).toHaveText('Staff management');
  await expect(card).toContainText(/won Super Bowl LXI/);
  await expect(page.locator('main .hub-date')).toHaveText('2026 season · Staff management');
  await expectNoHorizontalOverflow(page);
  await expectTouchTargets(page, 'main', phone ? 48 : 44);

  // One step: the awards, then the retirements that follow them.
  const step = page.getByRole('button', { name: 'Advance to Awards and Hall of Fame' });
  await step.focus();
  await page.keyboard.press('Enter');
  await expect(card.locator('.hero-title')).toHaveText('Awards and Hall of Fame', { timeout: 60_000 });
  await expect(status).toHaveText('Now: Awards and Hall of Fame.');
  await expect(page.getByRole('button', { name: 'Advance to Re-sign window' })).toBeFocused();

  // The rest of the way stops at the re-sign window, a deadline for the user's decisions; then free agency,
  // the draft, the schedule, and the cutdown.
  await page.getByRole('button', { name: 'Sim to the 2027 season' }).click();
  await expect(status).toHaveText('Now: Re-sign window. Stopped for: The re-sign window is open.', { timeout: 60_000 });
  await expect(card.getByRole('link', { name: 'Contracts' })).toBeVisible();
  // Where the user's roster breaks a rule, the league stops (D-46): at the cutdown, a roster short of 53.
  // The staff's fix is a tap away on the hub. The draft waits for the user's picks (D-48): here, the staff's.
  const stop = page.locator('main section.card', { hasText: 'Before you can advance' });
  const clock = card.getByText(/you're on the clock with the \d+(st|nd|rd|th) pick/);
  const seasonHere = page.locator('main .hub-date', { hasText: '2027 season · Week 1' });
  for (let stops = 0; stops < 6 && !(await seasonHere.isVisible()); stops++) {
    if (await stop.isVisible()) {
      await stop.getByRole('button', { name: 'Let your staff fix it' }).click();
      await page.getByRole('dialog', { name: 'Let your staff fix it' }).getByRole('button', { name: /^Make \d+ moves?$/ }).click();
      await expect(stop).toBeHidden();
    }
    if (await clock.isVisible()) {
      await card.getByRole('link', { name: 'Draft room' }).click();
      await page.getByRole('button', { name: 'Auto-draft the rest' }).click();
      await page.getByRole('dialog', { name: 'Auto-draft the rest' }).getByRole('button', { name: /^Auto-draft \d+ picks?$/ }).click();
      await expect(page.locator('main section.card', { hasText: "The media's grades" })).toBeVisible();
      await goTo(page, '#/', 'Team hub');
    }
    // At the cutdown, the last step, the button starts the season.
    await page.getByRole('button', { name: /^(Sim to|Start) the 2027 season$/ }).click();
    await expect(seasonHere.or(stop).or(clock).first()).toBeVisible({ timeout: 240_000 });
  }
  await expect(status).toHaveText('The 2027 season is here: week 1.');
  await expect(page.locator('main .hub-date')).toHaveText('2027 season · Week 1');
  await expect(page.locator('main section.card', { hasText: 'Next game and game plan' })).toContainText('Week 1');
  await expect(page.getByRole('button', { name: 'Play week 1' })).toBeVisible();

  // The offseason's messages, by the step each came with.
  await goTo(page, '#/inbox', 'Inbox');
  await expect(page.locator('main .inbox-item', { hasText: /The 2027 league year opens with a \$[\d,]+ cap/ })).toContainText('Contracts · Free agency, week 1');
  await expect(page.locator('main .inbox-item', { hasText: 'Your 2027 draft class' })).toContainText('Draft · Draft');
  await expect(page.locator('main .inbox-item', { hasText: 'The 2027 schedule is out' })).toBeVisible();
  await expect(page.locator('main .inbox-item', { hasText: 'OTAs and minicamp are underway' })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  // A preseason result opens its box score, kept apart from the season's games.
  const preseason = page.locator('main .inbox-item', { hasText: /Preseason, week 1: You (beat|lost to|tied) the / });
  await expect(preseason).toContainText('the game counts only in the preseason');
  // From the keyboard: on this long inbox, WebKit's emulated pointer has pressed the link and released on its
  // list item (runs 73 and 74), even with the link in the middle of the view, so nothing opened. The games
  // test clicks inbox links with the pointer.
  const box = preseason.getByRole('link', { name: /^Box score: Preseason, week 1/ });
  await box.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/game\/2027-P1-/);
  await expect(page.locator('main .nameplate-tag')).toHaveText('2027 · Preseason, week 1');
  await expect(page.locator('main table.line-score')).toBeVisible();

  // The new season's schedule.
  await goTo(page, '#/league/schedule', 'League');
  await expect(page.locator('main .game-card').first()).toBeVisible();
  await expect(page.locator('main')).toContainText('2027');
}); // prettier-ignore
