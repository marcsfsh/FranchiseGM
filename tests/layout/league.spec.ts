import { expect, test } from '@playwright/test';
import { FINISHED_FIXTURE, FINISHED_FIXTURE_NAME, SEASON_FIXTURE, SEASON_FIXTURE_NAME } from './global-setup';
import {
  expectNoHorizontalOverflow,
  expectRegionsMatchOverflow,
  expectTouchTargets,
  goTo,
  importLeagueFixture,
  sizeOf
} from './helpers';

// M9: the League section's standings, tiebreakers, playoff picture, and bracket (spec 19.3), in Night.
test('shows standings by division and by conference, with the tiebreakers that ordered them', async ({ page }, info) => {
  const phone = sizeOf(info) === 'phone';
  await importLeagueFixture(page, SEASON_FIXTURE, SEASON_FIXTURE_NAME, { theme: 'night' });
  await page.getByRole('link', { name: 'Full standings' }).click();
  await expect(page.locator('main h1')).toHaveText('League');
  await expect(page.getByRole('tab', { name: 'Standings' })).toHaveAttribute('aria-selected', 'true');
  const captions = page.locator('main table caption');
  await expect(captions).toHaveText(['AFC East', 'AFC North', 'AFC South', 'AFC West', 'NFC East', 'NFC North', 'NFC South', 'NFC West']);
  const us = page.locator('main tr.is-us');
  await expect(us).toHaveCount(1);
  await expect(us.locator('th')).toHaveText('Vikings (your team)');
  // Clubs tied on record are explained.
  const notes = page.locator('main .tiebreak-notes li');
  await expect(notes.first()).toHaveText(/^The \S+ are ahead of the \S+( and the \S+)?, also \d+–\d+(–\d+)?, on .+\.$/);
  await expectRegionsMatchOverflow(page);
  await expectNoHorizontalOverflow(page);
  await expectTouchTargets(page, 'main', phone ? 48 : 44);

  await page.getByRole('radio', { name: 'Conferences' }).check();
  await expect(captions).toHaveText(['AFC standings', 'NFC standings']);
  const afc = page.locator('main table', { has: page.locator('caption', { hasText: 'AFC standings' }) });
  await expect(afc.locator('tbody tr:not(.group-row)')).toHaveCount(16);
  await expect(afc.locator('td', { hasText: 'Division leader' })).toHaveCount(4);
  await expect(afc.locator('td', { hasText: 'Wild card' })).toHaveCount(3);
  await expectRegionsMatchOverflow(page);
  await expectNoHorizontalOverflow(page);

  // The tabs follow the arrow keys, and the view is kept when coming back.
  await page.getByRole('tab', { name: 'Standings' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Playoffs' })).toBeFocused();
  await expect(page.getByRole('tab', { name: 'Playoffs' })).toHaveAttribute('aria-selected', 'true');
  await goTo(page, '#/', 'Team hub');
  await goTo(page, '#/league/standings', 'League');
  await expect(page.getByRole('radio', { name: 'Conferences' })).toBeChecked();
}); // prettier-ignore

test('shows the playoff picture during the season and the bracket after it', async ({ page }, info) => {
  const phone = sizeOf(info) === 'phone';
  await importLeagueFixture(page, SEASON_FIXTURE, SEASON_FIXTURE_NAME);
  await goTo(page, '#/league/playoffs', 'League');
  for (const conference of ['AFC', 'NFC']) {
    const picture = page.locator('main section.card', { hasText: `${conference} playoff picture` });
    await expect(picture).toContainText('If the season ended today.');
    await expect(picture.getByRole('list', { name: `${conference} seeds` }).locator('li')).toHaveCount(7);
    await expect(picture.locator('li', { hasText: 'first-round bye' })).toHaveCount(1);
    await expect(picture.locator('.matchup-list').first().locator('li')).toHaveCount(3);
  }
  await expectNoHorizontalOverflow(page);

  await importLeagueFixture(page, FINISHED_FIXTURE, FINISHED_FIXTURE_NAME);
  await goTo(page, '#/league/playoffs', 'League');
  const bracket = page.locator('main section.card', { hasText: 'Playoff bracket' });
  await expect(bracket.locator('.hero-title')).toHaveText(/^The \S+ are champions\.$/);
  const rounds = bracket.locator('.bracket-round');
  await expect(rounds.locator('h3')).toHaveText(['Wild Card round', 'Divisional round', 'Conference championships', 'Super Bowl']);
  await expect(rounds.nth(0).locator('.game-card')).toHaveCount(6);
  await expect(rounds.nth(1).locator('.game-card')).toHaveCount(4);
  await expect(rounds.nth(2).locator('.game-card')).toHaveCount(2);
  await expect(rounds.nth(3).locator('.game-card')).toHaveCount(1);
  await expect(rounds.nth(3).locator('.is-winner')).toHaveCount(1);
  const first = rounds.nth(0).locator('.game-card').first();
  await expect(first.locator('.game-team')).toHaveText([/^\(\d\) \S+\d+(, won)?$/, /^\(\d\) \S+\d+(, won)?$/]);
  await expect(first.locator('.game-status')).toHaveText(/^(AFC|NFC) · Final(, overtime)? · Box score$/);
  await expect(first.getByRole('link')).toHaveAccessibleName(/^Box score: \S+ at \S+$/);
  await expectNoHorizontalOverflow(page);
  await expectTouchTargets(page, 'main', phone ? 48 : 44);
}); // prettier-ignore

test('ranks players by any stat with filters, and shows team offense and defense', async ({ page }, info) => {
  const phone = sizeOf(info) === 'phone';
  await importLeagueFixture(page, SEASON_FIXTURE, SEASON_FIXTURE_NAME);
  await goTo(page, '#/league/stats', 'League');
  const caption = page.locator('main table.leader-table caption');
  await expect(caption).toHaveText('Passing yards, 2026 regular season');
  const rows = page.locator('main table.leader-table tbody tr');
  await expect(rows.first().locator('td').first()).toHaveText(/^(T-)?1$/);
  const values = (await rows.locator('td:nth-child(3)').allTextContents()).map(v => Number(v.replace(/,/g, '')));
  expect(values.length).toBeGreaterThan(20);
  expect(values).toEqual([...values].sort((a, b) => b - a));
  await expectRegionsMatchOverflow(page);
  await expectNoHorizontalOverflow(page);
  await expectTouchTargets(page, 'main', phone ? 48 : 44);

  // A rate needs the minimum: six team games in, 14 pass attempts a game.
  await page.selectOption('#statsStat', 'passerRating');
  await expect(caption).toHaveText('Passer rating, 2026 regular season');
  await expect(page.locator('main p.hint', { hasText: 'qualify' })).toHaveText('Players with at least 84 pass attempts qualify.');
  await page.selectOption('#statsStat', 'rushYds');
  await page.selectOption('#statsPosition', 'HB');
  await expect(page.locator('main [role="status"]')).toHaveText(/^Rushing yards, 2026 regular season: \d+ players?\.$/);
  expect(new Set(await rows.locator('td:nth-child(4)').allTextContents())).toEqual(new Set(['HB']));
  await page.selectOption('#statsTeam', 'MIN');
  await expect(rows.locator('td:nth-child(5) abbr').first()).toHaveText('MIN');
  expect(new Set(await rows.locator('td:nth-child(5) abbr').allTextContents())).toEqual(new Set(['MIN']));
  await page.selectOption('#statsScope', 'career');
  await expect(caption).toHaveText('Rushing yards, career, regular season');
  await expect(page.locator('#statsSeason')).toBeHidden();

  // A player page and back: the same tab, the same place, and focus on his name (style guide 7.3).
  await page.selectOption('#statsScope', 'season');
  await page.selectOption('#statsTeam', 'all');
  const tenth = rows.nth(9).locator('[data-player-link]');
  const name = (await tenth.textContent()) ?? '';
  await tenth.click();
  await expect(page.locator('main h1')).toHaveText(name);
  await page.goBack();
  await expect(page.getByRole('tab', { name: 'Stats' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('main [data-player-link]', { hasText: name }).first()).toBeFocused();

  await page.getByRole('radio', { name: 'Teams' }).check();
  const offense = page.locator('main section.card', { hasText: 'Offense' }).locator('tbody tr');
  await expect(offense).toHaveCount(32);
  await expect(page.locator('main section.card', { hasText: 'Defense' }).locator('tbody tr')).toHaveCount(32);
  await expect(page.locator('main section.card', { hasText: 'Offense' }).locator('tr.is-us th')).toHaveText('Vikings (your team)');
  await expectRegionsMatchOverflow(page);
  await expectNoHorizontalOverflow(page);
}); // prettier-ignore
