import { IDBFactory } from 'fake-indexeddb';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseSchedule } from '../../src/data/schedule';
import { createLeague, defaultStartOptions, LeagueCreationError } from '../../src/engine/league/create';
import { SAVE_SCHEMA_VERSION, type League } from '../../src/engine/league/types';
import {
  ImportFormatError,
  SaveStore,
  SaveVersionError,
  exportFileName,
  exportLeague,
  importLeague
} from '../../src/storage/saves';
import { nameData } from '../helpers/base-data';

const schedule = parseSchedule(readFileSync('data-raw/schedule-2026.csv', 'utf8'), 2026);
const make = (seed = 11, id = 'league-a') =>
  createLeague({
    id,
    name: 'Test league',
    start: defaultStartOptions('MIN', seed),
    gameVersion: 'test',
    names: nameData(),
    schedule
  });
const league = make();

describe('league creation (spec 3.2)', () => {
  it('starts at week 1 of 2026 with the fictional league and the published schedule', () => {
    expect(league.schema).toBe(SAVE_SCHEMA_VERSION);
    expect(league.date).toEqual({ season: 2026, phase: 'regularSeason', week: 1 });
    expect(Object.keys(league.teams)).toHaveLength(32);
    expect(Object.keys(league.players)).toHaveLength(32 * 69 + 300);
    expect(league.schedule).toHaveLength(272);
    expect(league.meta.start.userTeam).toBe('MIN');
    expect(league.teams.MIN.staff.HC).toHaveLength(1);
    expect(league.teams.MIN.staff.SCOUT).toHaveLength(4);
    expect(league.nextId.p).toBe(32 * 69 + 301);
  });

  it('is JSON-safe, so saves and exports round-trip exactly', () => {
    expect(JSON.parse(JSON.stringify(league))).toStrictEqual(league);
  });

  it('repeats a seed and differs across seeds', () => {
    expect(make(11)).toStrictEqual(league);
    expect(make(12).players.p1).not.toEqual(league.players.p1);
  });

  it('refuses options this build does not support', () => {
    const start = { ...defaultStartOptions('DET', 1), dataSource: 'madden' as const };
    expect(() =>
      createLeague({ id: 'x', name: '', start, gameVersion: 't', names: nameData(), schedule })
    ).toThrow(LeagueCreationError);
  });
});

describe('saves (spec 21)', () => {
  it('saves, lists, and loads identical state', async () => {
    const store = await SaveStore.open(new IDBFactory());
    expect(store.available).toBe(true);
    const summary = await store.save(league, 1000);
    expect(summary).toMatchObject({ id: 'league-a', userTeam: 'MIN', season: 2026, week: 1, edited: false });
    expect(await store.list()).toEqual([summary]);
    expect(await store.load('league-a')).toStrictEqual(league);
  });

  it('keeps several leagues and deletes one', async () => {
    const store = await SaveStore.open(new IDBFactory());
    const other = make(5, 'league-b');
    await store.save(league, 1000);
    await store.save(other, 2000);
    expect((await store.list()).map(s => s.id)).toEqual(['league-b', 'league-a']);
    await store.remove('league-a');
    expect((await store.list()).map(s => s.id)).toEqual(['league-b']);
    await expect(store.load('league-a')).rejects.toThrow(/no longer saved/);
  });

  it('refuses an old save with the no-migration message', async () => {
    const store = await SaveStore.open(new IDBFactory());
    const old = { ...league, schema: SAVE_SCHEMA_VERSION - 1 } as League;
    await store.save(old, 1);
    const error = await store.load(old.meta.id).catch(e => e as Error);
    expect(error).toBeInstanceOf(SaveVersionError);
    expect((error as Error).message).toMatch(/older version.*doesn't convert old saves/);
  });

  it('falls back to memory when IndexedDB is blocked', async () => {
    const store = await SaveStore.open(null);
    expect(store.available).toBe(false);
    expect(store.unavailableReason).toMatch(/not available/);
    await store.save(league, 5);
    expect(await store.load('league-a')).toStrictEqual(league);
  });
});

describe('export and import (spec 21)', () => {
  it('round-trips a gzipped export to identical state', async () => {
    const blob = await exportLeague(league);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect([bytes[0], bytes[1]]).toEqual([0x1f, 0x8b]);
    expect(await importLeague(blob)).toStrictEqual(league);
  });

  it('round-trips through a save store too', async () => {
    const store = await SaveStore.open(new IDBFactory());
    await store.save(
      await importLeague(
        await exportLeague(
          await (async () => {
            await store.save(league, 3);
            return store.load(league.meta.id);
          })()
        )
      ),
      4
    );
    expect(await store.load(league.meta.id)).toStrictEqual(league);
  });

  it('reads plain JSON and rejects other files', async () => {
    const plain = new Blob([
      JSON.stringify({ format: 'franchise-gm-league', schema: SAVE_SCHEMA_VERSION, league })
    ]);
    expect(await importLeague(plain)).toStrictEqual(league);
    await expect(importLeague(new Blob(['hello']))).rejects.toBeInstanceOf(ImportFormatError);
    const old = new Blob([JSON.stringify({ format: 'franchise-gm-league', schema: 0, league })]);
    await expect(importLeague(old)).rejects.toBeInstanceOf(SaveVersionError);
  });

  it('names export files from the league and date', () => {
    expect(exportFileName(league)).toBe('franchise-gm-test-league-2026-week-1.json.gz');
  });

  it('refuses damaged league files before saving them (spec 21)', async () => {
    const damaged = (change: (copy: Record<string, unknown>) => void) => {
      const copy = structuredClone(league) as unknown as Record<string, unknown>;
      change(copy);
      return new Blob([
        JSON.stringify({ format: 'franchise-gm-league', schema: SAVE_SCHEMA_VERSION, league: copy })
      ]);
    };
    const cases: [(copy: Record<string, unknown>) => void, RegExp][] = [
      [c => ((c.meta as { start: { userTeam: string } }).start.userTeam = 'XXX'), /user's team/],
      [c => delete c.schedule, /schedule/],
      [c => ((c.date as { phase: string }).phase = 'moonSeason'), /isn't a phase/],
      [c => delete (c.teams as Record<string, unknown>).MIN, /team is missing/],
      [c => ((Object.values(c.players as object)[0] as { position: string }).position = 'QBX'), /player/]
    ];
    for (const [change, message] of cases) {
      const error = await importLeague(damaged(change)).catch((e: unknown) => e);
      expect(error, String(message)).toBeInstanceOf(ImportFormatError);
      expect((error as Error).message).toMatch(message);
    }
  });

  it('exports a save from another version as stored, so that version can open it (spec 2.4)', async () => {
    const store = await SaveStore.open(new IDBFactory());
    const older = { ...structuredClone(league), schema: SAVE_SCHEMA_VERSION - 1 };
    await store.save(older as League, 5);
    await expect(store.load(league.meta.id)).rejects.toBeInstanceOf(SaveVersionError);
    const file = await exportLeague(await store.loadRaw(league.meta.id));
    const error = await importLeague(file).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SaveVersionError);
    expect((error as Error).message).toMatch(/older version/);
  });
});

describe('last opened league', () => {
  it('is remembered in the save database and cleared when that league is deleted', async () => {
    const store = await SaveStore.open(new IDBFactory());
    expect(await store.getLastLeague()).toBeNull();
    await store.save(league, 1);
    await store.setLastLeague(league.meta.id);
    expect(await store.getLastLeague()).toBe(league.meta.id);
    await store.remove(league.meta.id);
    expect(await store.getLastLeague()).toBeNull();
    const memory = await SaveStore.open(null);
    await memory.setLastLeague('x');
    expect(await memory.getLastLeague()).toBe('x');
  });
});
