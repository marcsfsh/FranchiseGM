import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { FINISHED_FIXTURE, FINISHED_FIXTURE_NAME, SEASON_FIXTURE, SEASON_FIXTURE_NAME } from './global-setup';
import {
  contrastOf,
  expectNoHorizontalOverflow,
  expectTouchTargets,
  goTo,
  openGame,
  sizeOf
} from './helpers';

// M9: every screen a season needs, at every size, in Day and in Night (style guide 14.1, 14.2, 14.4).
interface Fixture {
  league: {
    meta: { start: { userTeam: string } };
    players: Record<
      string,
      { id: string; team: string | null; position: string; firstName: string; lastName: string }
    >;
    schedule: { id: string }[];
    season: { results: Record<string, unknown> };
  };
}
const fixture = JSON.parse(gunzipSync(readFileSync(SEASON_FIXTURE)).toString('utf8')) as Fixture;
const qb = Object.values(fixture.league.players).find(p => p.team === 'MIN' && p.position === 'QB');
const played = fixture.league.schedule.find(g => fixture.league.season.results[g.id]);
if (!qb || !played) throw new Error('fixture without a quarterback or a played game');

/** Each screen: its hash, its heading, and something that shows once its content is in. */
const SCREENS: { hash: string; heading: string | RegExp; ready?: string }[] = [
  { hash: '#/', heading: 'Team hub', ready: 'main .card' },
  { hash: '#/roster', heading: 'Roster', ready: 'main [data-player-link]:visible' },
  { hash: `#/player/${qb.id}`, heading: `${qb.firstName} ${qb.lastName}`, ready: 'main .card' },
  { hash: '#/depth-chart', heading: 'Depth chart', ready: 'main [role="tablist"]' },
  { hash: '#/game-plan', heading: 'Game plan', ready: 'main fieldset' },
  { hash: '#/staff', heading: 'Staff' },
  { hash: '#/scouting', heading: 'Scouting and draft' },
  { hash: '#/free-agency', heading: 'Free agency', ready: 'main .card' },
  { hash: '#/trades', heading: 'Trades' },
  { hash: '#/finances', heading: 'Salary cap', ready: 'main table' },
  { hash: '#/league/standings', heading: 'League', ready: 'main table.standings-table' },
  { hash: '#/league/playoffs', heading: 'League', ready: 'main .seed-list' },
  { hash: '#/league/schedule', heading: 'League', ready: 'main .game-card' },
  { hash: '#/league/stats', heading: 'League', ready: 'main table.leader-table' },
  { hash: '#/league/news', heading: 'League', ready: 'main .news-list' },
  { hash: `#/game/${played.id}`, heading: /^\S+ at \S+$/, ready: 'main table.line-score' },
  { hash: '#/inbox', heading: 'Inbox', ready: 'main .inbox-item' },
  { hash: '#/team/GB/roster', heading: 'Green Bay Packers', ready: 'main table.team-roster' },
  { hash: '#/history', heading: 'History', ready: 'main .card' },
  { hash: '#/settings', heading: 'Settings', ready: 'main .slider' }
];

for (const theme of ['day', 'night'] as const) {
  test(`lays out every screen in ${theme === 'day' ? 'Day' : 'Night'}`, async ({ page }, info) => {
    test.setTimeout(180_000);
    const target = sizeOf(info) === 'phone' ? 48 : 44;
    const check = async (where: string) => {
      await expectNoHorizontalOverflow(page);
      await expectTouchTargets(page, 'main', target);
      // The page heading reads on its plate (large text), and body text on its surface.
      expect(await contrastOf(page, 'main h1'), `${where} heading`).toBeGreaterThanOrEqual(3);
      if (await page.locator('main p').count())
        expect(await contrastOf(page, 'main p'), `${where} text`).toBeGreaterThanOrEqual(4.5);
    };
    // Before a league is open: the league list and the new league form.
    await openGame(page, { theme, hash: '#/leagues/new' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.locator('main h1')).toHaveText('New league');
    await check('New league');
    await goTo(page, '#/leagues', 'Leagues');
    await check('Leagues');
    await page.setInputFiles('#importLeagueFile', { name: 'league.json.gz', mimeType: 'application/gzip', buffer: readFileSync(SEASON_FIXTURE) });
    await page.locator('[data-league-id]', { hasText: SEASON_FIXTURE_NAME }).getByRole('button', { name: 'Continue' }).click();
    await expect(page.locator('main h1')).toHaveText('Team hub');
    for (const screen of SCREENS) {
      await page.evaluate(h => (location.hash = h), screen.hash);
      await expect(page.locator('main h1')).toHaveText(screen.heading);
      if (screen.ready) await expect(page.locator(screen.ready).first()).toBeVisible();
      await check(screen.hash);
    }

    // A game's other tabs.
    await page.evaluate(h => (location.hash = h), `#/game/${played.id}`);
    const gameTabs: [string, string][] = [['Box score', 'main table.team-stats'], ['Drives', 'main table.drive-table'], ['Recap', 'main table.scoring-table']];
    for (const [tab, ready] of gameTabs) {
      await page.getByRole('tab', { name: tab }).click();
      await expect(page.locator(ready)).toBeVisible();
      await check(`game ${tab}`);
    }

    // The dialogs: roster moves and a free agent offer (style guide 14.2's contract dialog).
    const dialog = page.locator('dialog[open]');
    const checkDialog = async (where: string) => {
      await expect(dialog).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await expectTouchTargets(page, 'dialog[open]', target);
      expect(await contrastOf(page, 'dialog[open] .dialog-title'), `${where} title`).toBeGreaterThanOrEqual(3);
      expect(await contrastOf(page, 'dialog[open] .dialog-body p'), `${where} text`).toBeGreaterThanOrEqual(4.5);
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
    };
    await page.evaluate(() => (location.hash = '#/roster'));
    await page.getByRole('button', { name: /^Moves for / }).first().click();
    await checkDialog('roster moves');
    await page.evaluate(() => (location.hash = '#/free-agency'));
    await page.getByRole('button', { name: /^Make an offer to / }).first().click();
    await checkDialog('offer');

    // The finished season's bracket.
    await goTo(page, '#/settings', 'Settings');
    await page.getByRole('button', { name: 'Switch league' }).click();
    await expect(page.locator('main h1')).toHaveText('Leagues');
    await page.setInputFiles('#importLeagueFile', { name: 'league.json.gz', mimeType: 'application/gzip', buffer: readFileSync(FINISHED_FIXTURE) });
    await page.locator('[data-league-id]', { hasText: FINISHED_FIXTURE_NAME }).getByRole('button', { name: 'Continue' }).click();
    await expect(page.locator('main h1')).toHaveText('Team hub');
    await check('finished hub');
    await goTo(page, '#/league/playoffs', 'League');
    await expect(page.locator('main .bracket-round')).toHaveCount(4);
    await check('bracket');
  }); // prettier-ignore
}

// Style guide 14.4: the narrowest phone at 200% text size still never scrolls sideways.
test('reflows at 320 pixels with 200% text', async ({ page }, info) => {
  test.skip(sizeOf(info) !== 'phone', 'A phone-width check.');
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 320, height: 568 });
  await openGame(page, { hash: '#/leagues' });
  await page.setInputFiles('#importLeagueFile', { name: 'league.json.gz', mimeType: 'application/gzip', buffer: readFileSync(SEASON_FIXTURE) });
  await page.locator('[data-league-id]', { hasText: SEASON_FIXTURE_NAME }).getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('main h1')).toHaveText('Team hub');
  await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
  for (const screen of SCREENS) {
    await page.evaluate(h => (location.hash = h), screen.hash);
    await expect(page.locator('main h1')).toHaveText(screen.heading);
    if (screen.ready) await expect(page.locator(screen.ready).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
}); // prettier-ignore
