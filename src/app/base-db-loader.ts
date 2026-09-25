/** Reads the embedded base database at startup (spec 6.8): plain JSON, or gzip and base64 when large. */
import { decodeBaseDb, type BaseDb, type BaseDbJson } from '../data/base-db';

export interface LoadedBaseDb {
  db: BaseDb;
  /** Milliseconds from navigation start until the database was ready. */
  readyAtMs: number;
}

export async function loadBaseDb(): Promise<LoadedBaseDb> {
  const node = document.getElementById('base-db');
  if (!node) throw new Error('This game file is missing its base database. Rebuild it with npm run build.');
  let text = node.textContent ?? '';
  if (node.dataset.encoding === 'gzip-base64') {
    const bytes = Uint8Array.from(atob(text), c => c.charCodeAt(0));
    const inflated = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    text = await new Response(inflated).text();
  }
  const db = decodeBaseDb(JSON.parse(text) as BaseDbJson);
  return { db, readyAtMs: performance.now() };
}
