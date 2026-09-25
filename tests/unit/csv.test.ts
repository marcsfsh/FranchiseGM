import { describe, expect, it } from 'vitest';
import { parseCsv } from '../../src/data/csv';

describe('parseCsv', () => {
  it('reads quoted cells, comments, and CRLF', () => {
    const table = parseCsv('# source note\n# another\nname,team\r\n"Smith, Jr.",MIN\r\n"Say ""hi""",DET\n\n');
    expect(table.headers).toEqual(['name', 'team']);
    expect(table.rows).toEqual([
      { name: 'Smith, Jr.', team: 'MIN' },
      { name: 'Say "hi"', team: 'DET' }
    ]);
    expect(table.lines).toEqual([4, 5]);
  });

  it('handles a missing trailing newline and short rows', () => {
    expect(parseCsv('a,b\n1').rows).toEqual([{ a: '1', b: '' }]);
    expect(parseCsv('').rows).toEqual([]);
  });
});
