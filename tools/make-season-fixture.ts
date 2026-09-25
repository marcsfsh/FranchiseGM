/**
 * Builds a league export partway through (or past the end of) the 2026 season for layout tests: the league is
 * advanced week by week exactly as the game does it, AI moves and injuries included, and every game is
 * recorded to history as the app records it. Deterministic.
 * `npx tsx tools/make-season-fixture.ts <out.json.gz> <weeks | all> [league name]`
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseClimate } from '../src/data/climate';
import { parseSchedule } from '../src/data/schedule';
import { createLeague, defaultStartOptions } from '../src/engine/league/create';
import type { League } from '../src/engine/league/types';
import { advanceWeek, gameWeek } from '../src/engine/season/advance';
import type { PlayerHistory } from '../src/engine/stats/aggregate';
import { TABLE_IDS } from '../src/engine/stats/categories';
import { emptySeason, recordGames, type GameRecord, type HistoryState } from '../src/engine/stats/record';
import { emptyRecords } from '../src/engine/stats/records';
import { encodeTable } from '../src/engine/stats/table';
import type { HistoryExport } from '../src/storage/history';
import { exportLeague } from '../src/storage/saves';
import { nameData } from '../tests/helpers/base-data';

export async function makeSeasonFixture(weeks: number, name = 'Season fixture'): Promise<Blob> {
  const schedule = parseSchedule(readFileSync('data-raw/schedule-2026.csv', 'utf8'), 2026);
  const climate = parseClimate(readFileSync('data-raw/climate.csv', 'utf8'));
  let league: League = createLeague({
    id: name.toLowerCase().replace(/\W+/g, '-'),
    name,
    start: defaultStartOptions('MIN', 31),
    gameVersion: 'fixture',
    names: nameData(),
    schedule,
    fixed: true
  });
  const players = new Map<string, PlayerHistory>();
  const games: GameRecord[] = [];
  let state: HistoryState = {
    tables: {},
    players,
    season: emptySeason(league.season.season),
    records: emptyRecords()
  };
  for (let played = 0; played < weeks && gameWeek(league) !== null; played++) {
    const week = advanceWeek(league, climate, { actions: 0, entropy: 0 });
    league = week.league;
    const patch = recordGames(state, week.games);
    for (const p of patch.players) players.set(p.id, p);
    games.push(...patch.games);
    state = { tables: patch.tables, players, season: patch.season, records: patch.records };
  }
  const history: HistoryExport = {
    tables: TABLE_IDS.flatMap(id => state.tables[id] ?? []).map(encodeTable),
    games,
    players: [...players.values()],
    seasons: [state.season],
    records: state.records
  };
  return exportLeague(league, history);
}

if (process.argv[1]?.endsWith('make-season-fixture.ts')) {
  const [out, count, name] = process.argv.slice(2);
  if (!out) throw new Error('Usage: make-season-fixture.ts <out.json.gz> <weeks | all> [league name]');
  const weeks = count === 'all' || count === undefined ? Infinity : Number(count);
  const blob = await makeSeasonFixture(weeks, name);
  writeFileSync(out, Buffer.from(await blob.arrayBuffer()));
}
