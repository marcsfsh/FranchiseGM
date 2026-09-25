import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { baseDbScript, buildBaseDb, GZIP_THRESHOLD } from '../../tools/build-db';
import { decodeBaseDb, fromColumns, toColumns, type BaseDbJson } from '../../src/data/base-db';

const built = buildBaseDb();

describe('base database (spec 6.8)', () => {
  it('holds the 2026 schedule, climate, names, and default staff', () => {
    expect(built.db.season).toBe(2026);
    expect(built.db.source).toBe('fictional');
    expect(built.db.schedule).toHaveLength(272);
    expect(Object.keys(built.db.climate).length).toBeGreaterThanOrEqual(37);
    expect(built.db.names.first.names).toHaveLength(3000);
    expect(built.db.staff).toHaveLength(32 * 19);
    expect(built.db.owners.map(o => o.team)).toHaveLength(32);
    expect(built.db.players).toEqual([]);
  });

  it('round-trips through the columnar JSON', () => {
    const json = JSON.parse(JSON.stringify(built.json)) as BaseDbJson;
    expect(decodeBaseDb(json)).toEqual(built.db);
  });

  it('is byte-identical across builds', () => {
    expect(JSON.stringify(buildBaseDb().json)).toBe(JSON.stringify(built.json));
    expect(buildBaseDb().mapping).toBe(built.mapping);
  });

  it('embeds as plain JSON under 2 MB with script-safe text', () => {
    const script = baseDbScript(built.json);
    expect(script.length).toBeLessThan(GZIP_THRESHOLD);
    expect(script.slice(script.indexOf('>') + 1, script.lastIndexOf('<'))).not.toContain('</');
  });

  it('gzips and base64-encodes above the threshold, and decodes back (spec 6.8)', () => {
    const script = baseDbScript(built.json, 0);
    expect(script).toContain('data-encoding="gzip-base64"');
    const payload = script.slice(script.indexOf('>') + 1, script.lastIndexOf('<'));
    const json = JSON.parse(gunzipSync(Buffer.from(payload, 'base64')).toString('utf8')) as BaseDbJson;
    expect(decodeBaseDb(json)).toEqual(built.db);
  });

  it('converts rows to columns and back', () => {
    const rows = [
      { a: 1, b: 'x' },
      { a: 2, b: 'y' }
    ];
    expect(fromColumns(toColumns(rows))).toEqual(rows);
    expect(toColumns([])).toEqual({});
  });
});
