import { describe, expect, it } from 'vitest';
import {
  addLevel,
  describeSort,
  moveLevel,
  pressHeader,
  sortRows,
  type SortKey
} from '../../src/app/ui/sort-rows';

// Post-M23 section 1.2: sorting tables by one or more columns.
interface Line {
  id: string;
  name: string;
  td: number;
  yds: number | null;
}
const lines: Line[] = [
  { id: 'a', name: 'Cole', td: 2, yds: 180 },
  { id: 'b', name: 'avery', td: 3, yds: 120 },
  { id: 'c', name: 'Blake', td: 2, yds: 240 },
  { id: 'd', name: 'Drew', td: 2, yds: null },
  { id: 'e', name: 'Eli', td: 3, yds: 120 }
];
const keys: SortKey<Line>[] = [
  { id: 'name', name: 'player', type: 'text', value: l => l.name },
  { id: 'td', name: 'touchdowns', type: 'number', value: l => l.td },
  { id: 'yds', name: 'passing yards', type: 'number', value: l => l.yds }
];
const ids = (rows: Line[]) => rows.map(r => r.id);
const sort = (levels: Parameters<typeof sortRows<Line>>[2]) => ids(sortRows(lines, keys, levels, l => l.id));

describe('sorting rows (post-M23 1.2)', () => {
  it('sorts by several columns in turn', () => {
    // Touchdowns high to low, then yards high to low for players tied on touchdowns.
    expect(sort([{ column: 'td', dir: 'desc' }, { column: 'yds', dir: 'desc' }])).toEqual(['b', 'e', 'c', 'a', 'd']);
    expect(sort([{ column: 'td', dir: 'asc' }, { column: 'yds', dir: 'asc' }])).toEqual(['a', 'c', 'd', 'b', 'e']);
  }); // prettier-ignore

  it('falls back to the table order, then the ID, so ties never shuffle', () => {
    expect(sort([])).toEqual(['a', 'b', 'c', 'd', 'e']);
    // b and e tie on both levels and keep the order they arrived in, whichever way the sort runs.
    expect(sort([{ column: 'td', dir: 'desc' }])).toEqual(['b', 'e', 'a', 'c', 'd']);
    expect(sort([{ column: 'td', dir: 'asc' }])).toEqual(['a', 'c', 'd', 'b', 'e']);
    const twins = [{ ...lines[0], id: 'z' } as Line, { ...lines[0], id: 'y' } as Line];
    expect(ids(sortRows(twins, keys, [{ column: 'td', dir: 'desc' }], l => l.id))).toEqual(['z', 'y']);
  });

  it('puts unknown values last in either direction', () => {
    expect(sort([{ column: 'yds', dir: 'desc' }]).at(-1)).toBe('d');
    expect(sort([{ column: 'yds', dir: 'asc' }]).at(-1)).toBe('d');
  });

  it('compares text without case, and numbers inside text by value', () => {
    expect(sort([{ column: 'name', dir: 'asc' }])).toEqual(['b', 'c', 'a', 'd', 'e']);
    const weeks = ['Week 10', 'Week 2', 'Week 1'].map(name => ({ id: name, name, td: 0, yds: 0 }));
    expect(ids(sortRows(weeks, keys, [{ column: 'name', dir: 'asc' }], l => l.id))).toEqual(['Week 1', 'Week 2', 'Week 10']);
  }); // prettier-ignore

  it('toggles a header, adds levels with Shift, and moves them', () => {
    const td = keys[1] as SortKey<Line>;
    const name = keys[0] as SortKey<Line>;
    // Numbers start high to low, text A to Z; the same header again reverses it.
    let levels = pressHeader([], td);
    expect(levels).toEqual([{ column: 'td', dir: 'desc' }]);
    levels = pressHeader(levels, td);
    expect(levels).toEqual([{ column: 'td', dir: 'asc' }]);
    // Another header replaces the whole sort.
    expect(pressHeader([...levels, { column: 'yds', dir: 'desc' }], name)).toEqual([{ column: 'name', dir: 'asc' }]);
    // Shift adds a level, or reverses one already there.
    levels = addLevel(levels, name) ?? [];
    expect(levels).toEqual([{ column: 'td', dir: 'asc' }, { column: 'name', dir: 'asc' }]);
    expect(addLevel(levels, name)).toEqual([{ column: 'td', dir: 'asc' }, { column: 'name', dir: 'desc' }]);
    // At most four levels.
    const four = ['a', 'b', 'c', 'd'].map(column => ({ column, dir: 'asc' as const }));
    expect(addLevel(four, td)).toBeNull();
    expect(moveLevel(levels, 1, -1)).toEqual([{ column: 'name', dir: 'asc' }, { column: 'td', dir: 'asc' }]);
    expect(moveLevel(levels, 0, -1)).toEqual(levels);
  }); // prettier-ignore

  it('describes the order for the announcement', () => {
    expect(
      describeSort(
        [
          { column: 'td', dir: 'desc' },
          { column: 'yds', dir: 'desc' }
        ],
        keys,
        'by rank'
      )
    ).toBe('Sorted by touchdowns, high to low, then passing yards, high to low.');
    expect(describeSort([{ column: 'name', dir: 'desc' }], keys, 'by rank')).toBe(
      'Sorted by player, Z to A.'
    );
    expect(describeSort([], keys, 'in tiebreaker order')).toBe('Sorted in tiebreaker order.');
  });
});
