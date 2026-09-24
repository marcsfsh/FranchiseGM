/**
 * A small promise wrapper over IndexedDB (spec 21). Saves live here; preferences stay in localStorage.
 * Opening fails with StorageUnavailableError when the browser blocks IndexedDB, so the app can fall back
 * to export-only operation and say so.
 */

export interface IndexSpec {
  name: string;
  keyPath: string | string[];
  unique?: boolean;
}

export interface StoreSpec {
  name: string;
  keyPath?: string | string[];
  indexes?: IndexSpec[];
}

export interface DbSpec {
  name: string;
  version: number;
  stores: StoreSpec[];
}

export class StorageUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'StorageUnavailableError';
  }
}

export type BatchOp =
  | { type: 'put'; store: string; value: unknown; key?: IDBValidKey }
  | { type: 'delete'; store: string; key: IDBValidKey | IDBKeyRange }
  | { type: 'clear'; store: string };

const done = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });

const settled = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
  });

export class Db {
  private constructor(
    private readonly db: IDBDatabase,
    readonly spec: DbSpec
  ) {}

  /** Opens (and creates or upgrades) a database. Stores missing from an older version are added. */
  static open(spec: DbSpec, factory: IDBFactory | null = globalThis.indexedDB ?? null): Promise<Db> {
    if (!factory)
      return Promise.reject(new StorageUnavailableError('IndexedDB is not available in this browser'));
    return new Promise((resolve, reject) => {
      let request: IDBOpenDBRequest;
      try {
        request = factory.open(spec.name, spec.version);
      } catch (cause) {
        reject(new StorageUnavailableError('IndexedDB is blocked in this browser', { cause }));
        return;
      }
      request.onupgradeneeded = () => {
        const db = request.result;
        const tx = request.transaction;
        for (const store of spec.stores) {
          const os = db.objectStoreNames.contains(store.name)
            ? (tx as IDBTransaction).objectStore(store.name)
            : db.createObjectStore(store.name, store.keyPath ? { keyPath: store.keyPath } : undefined);
          for (const index of store.indexes ?? []) {
            if (!os.indexNames.contains(index.name)) {
              os.createIndex(index.name, index.keyPath, { unique: index.unique ?? false });
            }
          }
        }
      };
      request.onsuccess = () => resolve(new Db(request.result, spec));
      request.onerror = () =>
        reject(new StorageUnavailableError('IndexedDB could not be opened', { cause: request.error }));
      request.onblocked = () =>
        reject(new StorageUnavailableError('Close other tabs running Franchise GM, then try again'));
    });
  }

  /** Deletes a whole database. */
  static remove(name: string, factory: IDBFactory | null = globalThis.indexedDB ?? null): Promise<void> {
    if (!factory)
      return Promise.reject(new StorageUnavailableError('IndexedDB is not available in this browser'));
    return done(factory.deleteDatabase(name)).then(() => undefined);
  }

  close(): void {
    this.db.close();
  }

  async get<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
    return (await done(this.db.transaction(store, 'readonly').objectStore(store).get(key))) as T | undefined;
  }

  async getAll<T>(store: string, query?: IDBValidKey | IDBKeyRange): Promise<T[]> {
    return (await done(this.db.transaction(store, 'readonly').objectStore(store).getAll(query))) as T[];
  }

  async getAllByIndex<T>(store: string, index: string, query?: IDBValidKey | IDBKeyRange): Promise<T[]> {
    const os = this.db.transaction(store, 'readonly').objectStore(store);
    return (await done(os.index(index).getAll(query))) as T[];
  }

  keys(store: string, query?: IDBValidKey | IDBKeyRange): Promise<IDBValidKey[]> {
    return done(this.db.transaction(store, 'readonly').objectStore(store).getAllKeys(query));
  }

  count(store: string, query?: IDBValidKey | IDBKeyRange): Promise<number> {
    return done(this.db.transaction(store, 'readonly').objectStore(store).count(query));
  }

  async put(store: string, value: unknown, key?: IDBValidKey): Promise<void> {
    await this.batch([{ type: 'put', store, value, ...(key === undefined ? {} : { key }) }]);
  }

  async delete(store: string, key: IDBValidKey | IDBKeyRange): Promise<void> {
    await this.batch([{ type: 'delete', store, key }]);
  }

  /** Applies every operation in one transaction: all of them commit or none do. */
  async batch(ops: readonly BatchOp[]): Promise<void> {
    if (ops.length === 0) return;
    const names = [...new Set(ops.map(op => op.store))];
    const tx = this.db.transaction(names, 'readwrite');
    const finished = settled(tx);
    try {
      for (const op of ops) {
        const os = tx.objectStore(op.store);
        if (op.type === 'put') {
          if (op.key === undefined) os.put(op.value);
          else os.put(op.value, op.key);
        } else if (op.type === 'delete') os.delete(op.key);
        else os.clear();
      }
    } catch (error) {
      // A request that throws synchronously (a bad key, an uncloneable value) aborts everything queued.
      tx.abort();
      await finished.catch(() => undefined);
      throw error;
    }
    await finished;
  }
}

/** Asks the browser not to evict saved data (spec 21). Resolves false when unsupported or refused. */
export async function requestPersistence(
  storage: StorageManager | undefined = globalThis.navigator?.storage
): Promise<boolean> {
  try {
    return (await storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
