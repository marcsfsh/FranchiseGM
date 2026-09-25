import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseClimate } from '../../src/data/climate';
import { parseSchedule } from '../../src/data/schedule';
import { createLeague, defaultStartOptions } from '../../src/engine/league/create';
import { simLeagueGame } from '../../src/engine/sim';
import { STAT_KEYS, LONG_STATS } from '../../src/engine/sim/stats';
import { careerTotals } from '../../src/engine/stats/aggregate';
import { CATEGORY_IDS, CATEGORY_KEYS } from '../../src/engine/stats/categories';
import type { GameMeta } from '../../src/engine/stats/record';
import { SaveStore, exportLeague, readLeagueFile } from '../../src/storage/saves';
import { nameData } from '../helpers/base-data';

const schedule = parseSchedule(readFileSync('data-raw/schedule-2026.csv', 'utf8'), 2026);
const climate = parseClimate(readFileSync('data-raw/climate.csv', 'utf8'));
const league = createLeague({
  id: 'history-league',
  name: 'History',
  start: defaultStartOptions('MIN', 21),
  gameVersion: 'test',
  names: nameData(),
  schedule,
  fixed: true
});
// Weeks 1 and 2, recorded as two batches.
const week = (n: number) =>
  league.schedule
    .filter(g => g.week === n)
    .map(g => ({
      result: simLeagueGame(league, g.id, climate),
      meta: { season: 2026, week: n, kind: 'regular' } as GameMeta
    }));
const batches = [week(1), week(2)];
const games = batches.flat();

async function recorded(): Promise<SaveStore> {
  const store = await SaveStore.open(new IDBFactory());
  await store.save(league);
  for (const batch of batches) await store.history.record(league.meta.id, batch);
  return store;
}

describe('history storage (spec 9.3)', () => {
  it('stores every player line and gives it back as a game log', async () => {
    const store = await recorded();
    const result = games[0]?.result;
    if (!result) throw new Error('no game');
    const [playerId, line] = Object.entries(result.box.home.players).find(([, l]) => l.passAtt > 10) ?? [];
    if (!playerId || !line) throw new Error('no passer');
    const log = await store.history.gameLog(league.meta.id, playerId, 2026);
    expect(log.length).toBeGreaterThanOrEqual(1);
    const first = log.find(e => e.gameId === result.id);
    expect(first?.week).toBe(1);
    expect(first?.home).toBe(true);
    expect(first?.opponent).toBe(result.away);
    expect([first?.teamScore, first?.opponentScore]).toEqual([result.score.home, result.score.away]);
    for (const c of CATEGORY_IDS)
      for (const k of CATEGORY_KEYS[c]) expect(first?.line[k] ?? 0, k).toBe(line[k]);
    expect(first?.penalties.length).toBe(line.penalties);
  });

  it('keeps aggregates equal to the sums of the stored logs', async () => {
    const store = await recorded();
    const players = new Set(
      games.flatMap(g => [
        ...Object.keys(g.result.box.home.players),
        ...Object.keys(g.result.box.away.players)
      ])
    );
    let checked = 0;
    for (const id of [...players].slice(0, 120)) {
      const history = await store.history.playerHistory(league.meta.id, id);
      const log = await store.history.gameLog(league.meta.id, id, 2026);
      const career = history ? careerTotals(history) : null;
      for (const key of STAT_KEYS) {
        if (key === 'tackles' || key === 'penalties' || key === 'penaltyYds') continue;
        const values = log.map(e => e.line[key] ?? 0);
        const expected = LONG_STATS.has(key) ? Math.max(0, ...values) : values.reduce((a, b) => a + b, 0);
        expect(career?.totals[key] ?? 0, `${id} ${key}`).toBe(expected);
      }
      if (history) expect(careerTotals(history).games).toBe(log.length);
      checked++;
    }
    expect(checked).toBe(120);
    const season = await store.history.season(league.meta.id, 2026);
    expect(season?.results).toHaveLength(games.length);
    for (const t of season?.teams ?? []) {
      const mine = games.filter(g => g.result.home === t.team || g.result.away === t.team);
      expect(t.games).toBe(mine.length);
      const points = mine.reduce(
        (sum, g) => sum + (g.result.home === t.team ? g.result.score.home : g.result.score.away),
        0
      );
      expect(t.pointsFor).toBe(points);
      expect(t.totals.points).toBe(points);
    }
    const leaders = season?.leaders.passYds ?? [];
    expect(leaders.length).toBeGreaterThan(5);
    for (let i = 1; i < leaders.length; i++)
      expect((leaders[i - 1]?.value ?? 0) >= (leaders[i]?.value ?? 0)).toBe(true);
    const book = await store.history.records(league.meta.id);
    expect(book.game.passYds?.[0]?.value).toBe(
      Math.max(
        ...games.flatMap(g =>
          [...Object.values(g.result.box.home.players), ...Object.values(g.result.box.away.players)].map(
            l => l.passYds
          )
        )
      )
    );
    expect(await store.history.seasons(league.meta.id)).toEqual([2026]);
    expect(
      (await store.history.game(league.meta.id, games[3]?.result.id ?? ''))?.recap.length
    ).toBeGreaterThan(0);
  });

  it('exports history with the league and imports it into a new browser', async () => {
    const store = await recorded();
    const file = await exportLeague(league, await store.history.exportHistory(league.meta.id));
    const read = await readLeagueFile(file);
    expect(read.league).toStrictEqual(league);
    const other = await SaveStore.open(new IDBFactory());
    if (!read.history) throw new Error('no history in the file');
    await other.history.importHistory('copy', read.history);
    const id = Object.keys(games[5]?.result.box.away.players ?? {})[0] ?? '';
    expect(await other.history.gameLog('copy', id, 2026)).toEqual(
      await store.history.gameLog(league.meta.id, id, 2026)
    );
    expect(await other.history.records('copy')).toEqual(await store.history.records(league.meta.id));
  });

  it('deletes a league with its history', async () => {
    const store = await recorded();
    await store.remove(league.meta.id);
    expect(await store.history.seasons(league.meta.id)).toEqual([]);
    const id = Object.keys(games[0]?.result.box.home.players ?? {})[0] ?? '';
    expect(await store.history.playerHistory(league.meta.id, id)).toBeNull();
    expect(await store.history.gameLog(league.meta.id, id, 2026)).toEqual([]);
  });

  it('records overlapping batches in order and skips games it already has', async () => {
    const store = await SaveStore.open(new IDBFactory());
    await store.save(league);
    await Promise.all(batches.map(b => store.history.record(league.meta.id, b)));
    const once = await store.history.exportHistory(league.meta.id);
    expect(once).toEqual(await (await recorded()).history.exportHistory(league.meta.id));
    // A retried week changes nothing and breaks no records.
    expect(await store.history.record(league.meta.id, batches[1] ?? [])).toEqual([]);
    expect(await store.history.exportHistory(league.meta.id)).toEqual(once);
  });

  it('keeps preseason games out of totals and playoff games apart', async () => {
    const store = await SaveStore.open(new IDBFactory());
    await store.save(league);
    const [pre, reg, post] = [games[0], games[1], games[2]];
    if (!pre || !reg || !post) throw new Error('no games');
    const as = (g: typeof pre, id: string, meta: GameMeta) => ({ result: { ...g.result, id }, meta });
    await store.history.record(league.meta.id, [
      as(pre, 'pre-1', { season: 2026, week: 1, kind: 'preseason' })
    ]);
    await store.history.record(league.meta.id, [reg]);
    await store.history.record(league.meta.id, [
      as(post, 'post-1', { season: 2026, week: 19, kind: 'playoffs' })
    ]);
    const passer = (g: typeof pre) =>
      Object.entries(g.result.box.home.players).find(([, l]) => l.passAtt > 10)?.[0] ?? '';
    // A preseason player opens the season's log without any totals.
    const preId = passer(pre);
    const preHistory = await store.history.playerHistory(league.meta.id, preId);
    expect(preHistory?.logSeasons).toEqual([2026]);
    expect(careerTotals(preHistory ?? { id: preId, seasons: [] }).totals.passYds ?? 0).toBe(
      reg.result.box.home.players[preId]?.passYds ?? reg.result.box.away.players[preId]?.passYds ?? 0
    );
    const log = await store.history.gameLog(league.meta.id, preId, 2026);
    expect(log.find(e => e.gameId === 'pre-1')?.kind).toBe('preseason');
    // Playoff lines and team seasons stay apart from the regular season's.
    const postId = passer(post);
    const postHistory = await store.history.playerHistory(league.meta.id, postId);
    const line = post.result.box.home.players[postId];
    expect(careerTotals(postHistory ?? { id: postId, seasons: [] }, 'playoffs').totals.passYds).toBe(
      line?.passYds
    );
    const season = await store.history.season(league.meta.id, 2026);
    expect(
      season?.teams
        .filter(t => t.kind === 'playoffs')
        .map(t => t.team)
        .sort()
    ).toEqual([post.result.home, post.result.away].sort());
    expect(
      season?.teams
        .filter(t => t.kind === 'regular')
        .map(t => t.team)
        .sort()
    ).toEqual([reg.result.home, reg.result.away].sort());
    const book = await store.history.records(league.meta.id);
    expect(book.team.gamePoints.every(e => e.gameId === reg.result.id)).toBe(true);
  });
});
