import { describe, expect, it } from 'vitest';
import { gameLines } from '../../src/engine/stats/record';
import {
  appendRows,
  decodeTable,
  emptyTable,
  encodeTable,
  indexByPlayer,
  readRow,
  tableBytes,
  type StatRow
} from '../../src/engine/stats/table';

const row = (
  playerId: string,
  gameId: string,
  values: Record<string, number>,
  kind: StatRow['kind'] = 'regular'
): StatRow => ({ playerId, gameId, team: 'MIN', kind, values });

describe('columnar stat tables (spec 9.3)', () => {
  it('appends rows with dictionaries and reads them back', () => {
    const empty = emptyTable(2026, 'rushing', ['rushAtt', 'rushYds']);
    const one = appendRows(empty, [
      row('p1', 'g1', { rushAtt: 20, rushYds: 97 }),
      row('p2', 'g1', { rushYds: -3 })
    ]);
    const two = appendRows(one, [row('p1', 'g2', { rushAtt: 18, rushYds: 140 }, 'preseason')]);
    expect(empty.rows).toBe(0);
    expect(one.rows).toBe(2);
    expect(two.rows).toBe(3);
    expect(two.players).toEqual(['p1', 'p2']);
    expect(two.games).toEqual(['g1', 'g2']);
    expect(readRow(two, 1)).toEqual(row('p2', 'g1', { rushAtt: 0, rushYds: -3 }));
    expect(readRow(two, 2)).toEqual(row('p1', 'g2', { rushAtt: 18, rushYds: 140 }, 'preseason'));
    expect(two.columns.rushYds).toBeInstanceOf(Int16Array);
    // The earlier table is unchanged.
    expect(one.players).toEqual(['p1', 'p2']);
    expect(one.columns.rushAtt?.length).toBe(2);
  });

  it('indexes rows by player and survives structured cloning', () => {
    let table = emptyTable(2026, 'passing', ['passAtt']);
    for (let g = 0; g < 17; g++)
      table = appendRows(table, [
        row('qb', `g${g}`, { passAtt: 30 + g }),
        row('backup', `g${g}`, { passAtt: g % 3 })
      ]);
    const index = indexByPlayer(structuredClone(table));
    expect(index.get('qb')).toHaveLength(17);
    expect(index.get('qb')?.map(i => readRow(table, i).values.passAtt)).toEqual(
      Array.from({ length: 17 }, (_, g) => 30 + g)
    );
    expect(tableBytes(table)).toBeGreaterThan(34 * 8);
  });

  it('round-trips through base64 text for export files', () => {
    let table = emptyTable(2027, 'rushing', ['rushAtt', 'rushYds']);
    for (let g = 0; g < 5; g++)
      table = appendRows(table, [
        row(`p${g}`, `g${g}`, { rushAtt: g * 3, rushYds: g % 2 ? -g : g * 40 }, 'playoffs')
      ]);
    const text = JSON.parse(JSON.stringify(encodeTable(table))) as ReturnType<typeof encodeTable>;
    const back = decodeTable(text);
    expect(back).toEqual(table);
    expect(readRow(back, 3)).toEqual(row('p3', 'g3', { rushAtt: 9, rushYds: -3 }, 'playoffs'));
    expect(decodeTable(encodeTable(emptyTable(2027, 'passing', ['passAtt']))).rows).toBe(0);
    expect(() => decodeTable({ ...text, rows: 6 })).toThrow(/damaged/);
  });
});

describe('box score lines (spec 8.8)', () => {
  it("reads one game's rows from every table, in table order", () => {
    const rushing = appendRows(emptyTable(2026, 'rushing', ['rushAtt', 'rushYds']), [
      row('p1', 'g1', { rushAtt: 20, rushYds: 97 }),
      row('p2', 'g2', { rushAtt: 3, rushYds: 9 }),
      row('p3', 'g1', { rushAtt: 1, rushYds: -2 })
    ]);
    const passing = appendRows(emptyTable(2026, 'passing', ['passAtt']), [row('p4', 'g1', { passAtt: 30 })]);
    expect(gameLines('g1', { rushing, passing }).map(l => [l.table, l.row.playerId])).toEqual([
      ['passing', 'p4'],
      ['rushing', 'p1'],
      ['rushing', 'p3']
    ]);
    expect(gameLines('g9', { rushing, passing })).toEqual([]);
  });
});
