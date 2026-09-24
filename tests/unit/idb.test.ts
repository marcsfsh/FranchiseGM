import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { Db, StorageUnavailableError, type DbSpec } from '../../src/storage/idb';

const SPEC: DbSpec = {
  name: 'gm-test',
  version: 1,
  stores: [
    { name: 'leagues', keyPath: 'id', indexes: [{ name: 'byTeam', keyPath: 'team' }] },
    { name: 'blobs' }
  ]
};

const fresh = () => new IDBFactory();

describe('Db', () => {
  it('puts, gets, lists, and deletes', async () => {
    const db = await Db.open(SPEC, fresh());
    await db.put('leagues', { id: 'a', team: 'MIN', season: 2026 });
    await db.put('leagues', { id: 'b', team: 'DET', season: 2027 });
    await db.put('blobs', { big: [1, 2, 3] }, 'state:a');
    expect(await db.get('leagues', 'a')).toEqual({ id: 'a', team: 'MIN', season: 2026 });
    expect(await db.get('blobs', 'state:a')).toEqual({ big: [1, 2, 3] });
    expect(await db.count('leagues')).toBe(2);
    expect((await db.getAllByIndex<{ id: string }>('leagues', 'byTeam', 'DET')).map(l => l.id)).toEqual([
      'b'
    ]);
    expect(await db.keys('leagues')).toEqual(['a', 'b']);
    await db.delete('leagues', 'a');
    expect(await db.get('leagues', 'a')).toBeUndefined();
    db.close();
  });

  it('applies a batch atomically', async () => {
    const db = await Db.open(SPEC, fresh());
    await db.put('leagues', { id: 'keep', team: 'GB' });
    // The second put has no key for a store without a key path, so the whole batch fails.
    await expect(
      db.batch([
        { type: 'put', store: 'leagues', value: { id: 'new', team: 'CHI' } },
        { type: 'put', store: 'blobs', value: 'no key' }
      ])
    ).rejects.toBeTruthy();
    expect(await db.get('leagues', 'new')).toBeUndefined();
    await db.batch([
      { type: 'put', store: 'leagues', value: { id: 'new', team: 'CHI' } },
      { type: 'delete', store: 'leagues', key: 'keep' }
    ]);
    expect(await db.keys('leagues')).toEqual(['new']);
    db.close();
  });

  it('keeps data across reopen and adds new stores on upgrade', async () => {
    const factory = fresh();
    const v1 = await Db.open(SPEC, factory);
    await v1.put('leagues', { id: 'x', team: 'SEA' });
    v1.close();
    const v2 = await Db.open({ ...SPEC, version: 2, stores: [...SPEC.stores, { name: 'stats' }] }, factory);
    expect(await v2.get('leagues', 'x')).toEqual({ id: 'x', team: 'SEA' });
    await v2.put('stats', 1, 'k');
    expect(await v2.get('stats', 'k')).toBe(1);
    v2.close();
    await Db.remove(SPEC.name, factory);
    const again = await Db.open(SPEC, factory);
    expect(await again.count('leagues')).toBe(0);
    again.close();
  });

  it('reports unavailable storage with a typed error', async () => {
    await expect(Db.open(SPEC, null)).rejects.toBeInstanceOf(StorageUnavailableError);
    const throwing = {
      open() {
        throw new Error('SecurityError');
      }
    } as unknown as IDBFactory;
    await expect(Db.open(SPEC, throwing)).rejects.toBeInstanceOf(StorageUnavailableError);
  });
});
