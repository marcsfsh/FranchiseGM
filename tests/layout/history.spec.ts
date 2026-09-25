import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { HISTORY_FIXTURE } from './global-setup';
import {
  expectNoHorizontalOverflow,
  expectRegionsMatchOverflow,
  expectTouchTargets,
  openGame,
  sizeOf
} from './helpers';

// M5: career stats, game logs, and the records book from stored history (spec 9, 18.5).
interface Fixture {
  league: { meta: { name: string } };
  history: { players: { id: string; seasons: { season: number; totals: { passYds?: number } }[] }[] };
}
const file = readFileSync(HISTORY_FIXTURE);
const fixture = JSON.parse(gunzipSync(file).toString('utf8')) as Fixture;
// The league's leading passer over the stored seasons.
const passer = [...fixture.history.players].sort(
  (a, b) =>
    b.seasons.reduce((s, l) => s + (l.totals.passYds ?? 0), 0) -
    a.seasons.reduce((s, l) => s + (l.totals.passYds ?? 0), 0)
)[0] as Fixture['history']['players'][number];
const seasons = [...new Set(passer.seasons.map(l => l.season))].sort();

async function importFixture(page: Page): Promise<void> {
  await openGame(page, { hash: '#/leagues' });
  await page.setInputFiles('#importLeagueFile', {
    name: 'history-league.json.gz',
    mimeType: 'application/gzip',
    buffer: file
  });
  const card = page.locator('[data-league-id]', { hasText: fixture.league.meta.name });
  await card.getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('main h1')).toHaveText('Team hub');
}

test('shows career stats and a game log for any stored season', async ({ page }, info) => {
  await importFixture(page);
  await page.evaluate(id => (location.hash = `#/player/${id}`), passer.id);
  const career = page.locator('main section.card', { hasText: 'Career stats' });
  const passing = career.locator('table', { has: page.locator('caption', { hasText: /^Passing$/ }) });
  await expect(passing).toBeVisible();
  await expect(passing.locator('tbody tr')).toHaveCount(seasons.length);
  await expect(passing.locator('tfoot')).toContainText('Career');
  // Headers show abbreviations and read their full names.
  await expect(passing.getByRole('columnheader', { name: 'Completion percentage' })).toBeVisible();
  await expectRegionsMatchOverflow(page);

  // The newest season's log loads first; an older one loads on request, one season at a time.
  const log = career.locator('table', { has: page.locator('caption', { hasText: 'game log' }) });
  await expect(log.locator('caption')).toHaveText(`Passing game log, ${seasons.at(-1)}`);
  await expect(log.locator('tbody tr')).toHaveCount(17);
  await page.selectOption('#logSeason', String(seasons[0]));
  await expect(log.locator('caption')).toHaveText(`Passing game log, ${seasons[0]}`);
  await expect(career.getByRole('status')).toHaveText(`Passing game log, ${seasons[0]}: 17 games.`);
  const ms = await page.evaluate(() => performance.getEntriesByName('game-log').map(e => e.duration));
  expect(ms.length).toBeGreaterThanOrEqual(2);
  console.log(`Measured: game logs load in ${ms.map(m => Math.round(m)).join(' and ')} ms.`);
  await page.selectOption('#logCategory', { label: 'Rushing' });
  await expect(career.getByRole('status')).toContainText('Rushing game log');

  await expectNoHorizontalOverflow(page);
  await expectTouchTargets(page, 'main', sizeOf(info) === 'phone' ? 48 : 44);
  await expectRegionsMatchOverflow(page);
  // Career tables reflow at 200% text without page scrolling.
  await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
  await expectNoHorizontalOverflow(page);
  await page.evaluate(() => (document.documentElement.style.fontSize = ''));
});

test('lists records by scope and stat, and returns to the list from a player', async ({ page }, info) => {
  await importFixture(page);
  await page.evaluate(() => (location.hash = '#/history'));
  await expect(page.locator('main h1')).toHaveText('History');
  const book = page.locator('main section.card', { hasText: 'Records book' });
  const table = book.locator('table');
  await expect(table.locator('caption')).toHaveText('Passing yards, single game');
  await expect(table.locator('tbody tr')).toHaveCount(10);
  const target = sizeOf(info) === 'phone' ? 48 : 44;
  for (const [scope, caption] of [
    ['game', 'Passing yards, single game'],
    ['season', 'Passing yards, single season'],
    ['career', 'Passing yards, career'],
    ['team', 'Wins in a season, team records']
  ] as const) {
    await page.selectOption('#recordScope', scope);
    await expect(table.locator('caption')).toHaveText(caption);
    await expectNoHorizontalOverflow(page);
    await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
    await expectNoHorizontalOverflow(page);
    await page.evaluate(() => (document.documentElement.style.fontSize = ''));
    await expectTouchTargets(page, 'main', target);
  }

  // Open a record holder, go back, and land on the same list with focus on his link.
  await page.selectOption('#recordScope', 'career');
  await page.selectOption('#recordStat', 'recYds');
  const link = table.locator('tbody tr').nth(2).getByRole('link');
  const name = (await link.textContent()) ?? '';
  const id = (await link.getAttribute('data-player-link')) ?? '';
  await link.click();
  await expect(page.locator('main h1')).toHaveText(name);
  await page.goBack();
  await expect(page.locator('#recordScope')).toHaveValue('career');
  await expect(page.locator('#recordStat')).toHaveValue('recYds');
  await expect(page.locator(`main [data-player-link="${id}"]`)).toBeFocused();
});
