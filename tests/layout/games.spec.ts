import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { HISTORY_FIXTURE, SEASON_FIXTURE, SEASON_FIXTURE_NAME } from './global-setup';
import {
  expectNoHorizontalOverflow,
  expectRegionsMatchOverflow,
  expectTouchTargets,
  goTo,
  importLeagueFixture,
  sizeOf
} from './helpers';

// M9: schedule and results, and a game's page with its recap, box score, and drives (spec 8.8, 19.3).
interface Fixture {
  league: {
    meta: { name: string };
    schedule: { id: string; week: number; home: string; away: string }[];
    season: { results: Record<string, unknown> };
  };
  history: { games: { id: string; home: string; away: string; season: number }[] };
}
const read = (file: string): Fixture =>
  JSON.parse(gunzipSync(readFileSync(file)).toString('utf8')) as Fixture;

test('lists a week of games and a club season, and opens a box score', async ({ page }, info) => {
  const phone = sizeOf(info) === 'phone';
  await importLeagueFixture(page, SEASON_FIXTURE, SEASON_FIXTURE_NAME);
  await goTo(page, '#/league/schedule', 'League');
  await expect(page.getByRole('tab', { name: 'Schedule' })).toHaveAttribute('aria-selected', 'true');
  // Six weeks in, the schedule opens on week 7, still to be played.
  await expect(page.locator('#scheduleWeek')).toHaveValue('7');
  const games = page.getByRole('list', { name: 'Week 7 games' }).locator('.game-card');
  await expect(games.first().getByRole('link')).toHaveAccessibleName(/^Preview: \S+ at \S+$/);
  await expect(page.locator('main')).toContainText(/Byes: .+\./);
  await page.selectOption('#scheduleWeek', '1');
  const week1 = page.getByRole('list', { name: 'Week 1 games' }).locator('.game-card');
  await expect(week1).toHaveCount(16);
  await expect(page.locator('main [role="status"]')).toHaveText('Week 1: 16 games.');
  await expect(week1.getByRole('link', { name: /^Box score: / })).toHaveCount(16);
  await expectNoHorizontalOverflow(page);
  await expectTouchTargets(page, 'main', phone ? 48 : 44);

  await page.selectOption('#scheduleTeam', 'MIN');
  await expect(page.locator('#scheduleWeek')).toBeDisabled();
  const season = page.getByRole('list', { name: 'Vikings schedule' }).locator('.game-card');
  await expect(season).toHaveCount(18);
  await expect(season.filter({ hasText: 'Bye' })).toHaveCount(1);
  await season.first().getByRole('link', { name: /^Box score: / }).click();

  await expect(page.locator('main .nameplate-tag')).toHaveText('2026 · Week 1');
  await expect(page.locator('main h1')).toHaveText(/^\S+ at \S+$/);
  const final = page.locator('main section.card', { hasText: 'Final' }).first();
  await expect(final.locator('table.line-score tbody tr')).toHaveCount(2);
  await expect(page.getByRole('tab', { name: 'Recap' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('main section.card', { hasText: 'Recap' }).locator('p').first()).not.toBeEmpty();
  await expect(page.locator('main table.scoring-table tbody tr').first()).toBeVisible();
  await expectRegionsMatchOverflow(page);
  await expectNoHorizontalOverflow(page);

  await page.getByRole('tab', { name: 'Box score' }).click();
  await expect(page.locator('main table.team-stats tbody tr')).toHaveCount(14);
  const players = page.getByRole('group', { name: 'Players' });
  await expect(players.getByRole('radio', { name: 'Vikings' })).toBeChecked();
  await expect(page.locator('main section.card', { hasText: 'Vikings box score' }).locator('caption').first()).toHaveText('Passing');
  await players.getByRole('radio', { name: /^(?!Vikings)/ }).check();
  await expect(page.locator('main section.card', { hasText: 'Vikings box score' })).toHaveCount(0);
  await page.getByText('Blocking and snaps').click();
  await expect(page.locator('main details.box-more caption')).toHaveText(['Blocking', 'Snaps']);
  await expectRegionsMatchOverflow(page);
  await expectNoHorizontalOverflow(page);
  await expectTouchTargets(page, 'main', phone ? 48 : 44);

  await page.getByRole('tab', { name: 'Drives' }).click();
  expect(await page.locator('main table.drive-table tbody tr').count()).toBeGreaterThan(10);
  await expectNoHorizontalOverflow(page);
}); // prettier-ignore

test('links results from the inbox, previews a game, and opens one from an earlier season', async ({ page }, info) => {
  test.skip(info.project.name.endsWith('tablet'), 'Phone and desktop cover it.');
  const fixture = read(SEASON_FIXTURE);
  await importLeagueFixture(page, SEASON_FIXTURE, SEASON_FIXTURE_NAME, { theme: 'night' });
  const inbox = page.locator('main section.card', { hasText: 'Inbox' });
  await inbox.getByRole('link', { name: /^Box score: (Win|Loss|Tie) / }).first().click();
  // The Vikings' latest game (they may have had a bye since).
  const last = Math.max(
    ...fixture.league.schedule
      .filter(g => (g.home === 'MIN' || g.away === 'MIN') && fixture.league.season.results[g.id])
      .map(g => g.week)
  );
  await expect(page.locator('main .nameplate-tag')).toHaveText(`2026 · Week ${last}`);
  await expect(page.getByRole('tab', { name: 'Recap' })).toBeVisible();

  const upcoming = fixture.league.schedule.find(g => g.week === 7 && (g.home === 'MIN' || g.away === 'MIN'));
  if (!upcoming) throw new Error('no week 7 game');
  await page.evaluate(id => (location.hash = `#/game/${id}`), upcoming.id);
  const preview = page.locator('main section.card', { hasText: 'Preview' });
  await expect(preview).toContainText("This game hasn't been played yet.");
  await expect(preview.getByRole('link', { name: 'Set game plan' })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  // Games from seasons before this one live only in history.
  const history = read(HISTORY_FIXTURE);
  const old = history.history.games[0];
  if (!old) throw new Error('no stored game');
  await importLeagueFixture(page, HISTORY_FIXTURE, history.league.meta.name);
  await page.evaluate(id => (location.hash = `#/game/${id}`), old.id);
  await expect(page.locator('main .nameplate-tag')).toHaveText(`${old.season} · Week 1`);
  await expect(page.locator('main table.line-score tbody tr')).toHaveCount(2);
  await page.evaluate(() => (location.hash = '#/game/nope'));
  await expect(page.locator('main section.card', { hasText: 'Game not found' })).toBeVisible();
}); // prettier-ignore
