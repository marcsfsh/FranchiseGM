/**
 * Builds a league export with several seasons of history for layout tests and storage measurements:
 * the 2026 schedule is simmed once per season and recorded as that season's games. Deterministic.
 * `npx tsx tools/make-history-fixture.ts <out.json.gz> [seasons]`
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseClimate } from '../src/data/climate';
import { parseSchedule } from '../src/data/schedule';
import { createLeague, defaultStartOptions } from '../src/engine/league/create';
import { stream } from '../src/engine/rng';
import { simulateGame } from '../src/engine/sim/game';
import { gameSetup } from '../src/engine/sim/setup';
import type { PlayerHistory } from '../src/engine/stats/aggregate';
import { TABLE_IDS } from '../src/engine/stats/categories';
import {
  emptySeason,
  recordGames,
  type GameRecord,
  type HistoryState,
  type SeasonSummary
} from '../src/engine/stats/record';
import { emptyRecords } from '../src/engine/stats/records';
import { encodeTable, tableBytes, type StatTable } from '../src/engine/stats/table';
import type { HistoryExport } from '../src/storage/history';
import { exportLeague } from '../src/storage/saves';
import { nameData } from '../tests/helpers/base-data';

export async function makeHistoryFixture(seasons: number): Promise<{ blob: Blob; bytesPerSeason: number }> {
  const schedule = parseSchedule(readFileSync('data-raw/schedule-2026.csv', 'utf8'), 2026);
  const climate = parseClimate(readFileSync('data-raw/climate.csv', 'utf8'));
  const league = createLeague({
    id: 'history-fixture',
    name: 'History fixture',
    start: defaultStartOptions('SF', 31),
    gameVersion: 'fixture',
    names: nameData(),
    schedule,
    fixed: true
  });
  const first = league.date.season - seasons;
  const players = new Map<string, PlayerHistory>();
  const tables: StatTable[] = [];
  const games: GameRecord[] = [];
  const summaries: SeasonSummary[] = [];
  let records = emptyRecords();
  // One simulated regular season, recorded again under each season's label (the sim is the slow part).
  const weeks = Array.from({ length: 18 }, (_, w) =>
    league.schedule
      .filter(g => g.week === w + 1)
      .map((g, i) => {
        const rng = stream(31, 'fixture', w, i);
        return simulateGame(gameSetup(league, g, climate, rng.fork('setup')), rng.fork('plays'));
      })
  );
  for (let s = 0; s < seasons; s++) {
    const season = first + s;
    let state: HistoryState = { tables: {}, players, season: emptySeason(season), records };
    weeks.forEach((results, w) => {
      const batch = results.map(r => ({
        result: { ...r, id: r.id.replace(/^\d{4}-/, `${season}-`) },
        meta: { season, week: w + 1, kind: 'regular' as const }
      }));
      const patch = recordGames(state, batch);
      for (const p of patch.players) players.set(p.id, p);
      games.push(...patch.games);
      records = patch.records;
      state = { tables: patch.tables, players, season: patch.season, records };
    });
    tables.push(...TABLE_IDS.flatMap(id => state.tables[id] ?? []));
    summaries.push(state.season);
  }
  const history: HistoryExport = {
    tables: tables.map(encodeTable),
    games,
    players: [...players.values()],
    seasons: summaries,
    records
  };
  const bytes = tables.reduce((sum, t) => sum + tableBytes(t), 0) / seasons;
  return { blob: await exportLeague(league, history), bytesPerSeason: bytes };
}

if (process.argv[1]?.endsWith('make-history-fixture.ts')) {
  const out = process.argv[2] ?? 'history-fixture.json.gz';
  const { blob, bytesPerSeason } = await makeHistoryFixture(Number(process.argv[3] ?? 3));
  writeFileSync(out, new Uint8Array(await blob.arrayBuffer()));
  console.log(
    `Wrote ${out}: ${(blob.size / 1e6).toFixed(1)} MB gzipped; stat tables ${(bytesPerSeason / 1e6).toFixed(2)} MB a season`
  );
}
