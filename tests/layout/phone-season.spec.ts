import { expect, test } from '@playwright/test';
import { createLeague, expectNoHorizontalOverflow, goTo, openGame, sizeOf } from './helpers';

// M9's done-when: a full season can be played start to finish on an iPhone-sized screen.
test('plays a whole season week by week on a phone, reading results and standings along the way', async ({ page }, info) => {
  test.skip(sizeOf(info) !== 'phone', 'The phone is the point.');
  test.setTimeout(900_000);
  await openGame(page);
  await createLeague(page, { name: 'Phone season', team: 'MIN', seed: '77' });
  const date = page.locator('main .hub-date');
  let weeks = 0;
  for (;;) {
    const play = page.getByRole('button', { name: /^Play / });
    if ((await play.count()) === 0) break;
    const before = await date.textContent();
    await play.click();
    await expect(date).not.toHaveText(before ?? '', { timeout: 120_000 });
    weeks++;
    if (weeks === 1 || weeks === 10) {
      // Read the week's result like a player would, then come back.
      const result = page.locator('main section.card', { hasText: 'Inbox' }).getByRole('link', { name: /^Box score: / });
      if (await result.count()) {
        await result.first().click();
        await expect(page.locator('main table.line-score')).toBeVisible();
        await expectNoHorizontalOverflow(page);
      }
      await goTo(page, '#/league/standings', 'League');
      await expect(page.locator('main tr.is-us')).toHaveCount(1);
      await expectNoHorizontalOverflow(page);
      await goTo(page, '#/', 'Team hub');
    }
  }
  // Eighteen weeks and four playoff rounds, whether or not the Vikings are still playing.
  expect(weeks).toBe(22);
  await expect(date).toHaveText('2026 season · Staff management');
  await expect(page.locator('main section.card', { hasText: 'Next game and game plan' })).toContainText(/won Super Bowl LXI/);
  await goTo(page, '#/league/playoffs', 'League');
  await expect(page.locator('main .bracket-round').last().locator('.is-winner')).toHaveCount(1);
  await expectNoHorizontalOverflow(page);
}); // prettier-ignore
