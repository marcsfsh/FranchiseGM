/**
 * Sizes and times for milestone reports (post-M23 section 2.18): measured and printed, never enforced.
 * `npm run measure` after `npm run build`: the game file's size, a new league, one game, a regular season
 * through the weekly advance, and the save it leaves.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { parseClimate } from '../src/data/climate';
import { parseSchedule } from '../src/data/schedule';
import { createLeague, defaultStartOptions } from '../src/engine/league/create';
import { advanceWeek } from '../src/engine/season/advance';
import { simLeagueGame } from '../src/engine/sim';
import { nameData } from '../tests/helpers/base-data';

const mb = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(2)} MB`;
const timed = <T>(run: () => T): [T, number] => {
  const started = performance.now();
  const out = run();
  return [out, performance.now() - started];
};

const schedule = parseSchedule(readFileSync('data-raw/schedule-2026.csv', 'utf8'), 2026);
const climate = parseClimate(readFileSync('data-raw/climate.csv', 'utf8'));
const names = nameData();
const [league, createMs] = timed(() =>
  createLeague({
    id: 'measure',
    name: 'Measure',
    start: defaultStartOptions('MIN', 7),
    gameVersion: 'measure',
    names,
    schedule,
    fixed: true
  })
);

// One game: the median of 21, so a stray pause doesn't count.
const games = league.schedule.slice(100, 121).map(g => timed(() => simLeagueGame(league, g.id, climate))[1]);
const perGame = [...games].sort((a, b) => a - b)[Math.floor(games.length / 2)] ?? 0;

// Every team managed, the user's too, as the calibration's loop seasons are.
league.settings.auto.roster = true;
const [, seasonMs] = timed(() => {
  while (league.date.phase === 'regularSeason') {
    const week = advanceWeek(league, climate, { actions: 0, entropy: 0 });
    if (week.blocked) throw new Error(week.blocked);
  }
});
const save = JSON.stringify(league);

const lines = [
  existsSync('dist/game.html') ? `game.html: ${mb(statSync('dist/game.html').size)}` : 'game.html: not built',
  `New league: ${(createMs / 1000).toFixed(2)} s`,
  `One game (median of ${games.length}): ${perGame.toFixed(1)} ms`,
  `Regular season through the weekly advance: ${(seasonMs / 1000).toFixed(1)} s`,
  `Save after the regular season: ${mb(save.length)} as JSON, ${mb(gzipSync(save).length)} gzipped`
];
for (const line of lines) console.log(line);
