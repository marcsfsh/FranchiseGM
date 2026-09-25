import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { END, START, withCatalog } from '../../tools/catalog-doc';

describe('catalogs in docs/DECISIONS.md', () => {
  it('match the code (run `npx tsx tools/catalog-doc.ts` after changing a catalog)', () => {
    const text = readFileSync('docs/DECISIONS.md', 'utf8');
    expect(text).toContain(START);
    expect(text).toContain(END);
    expect(withCatalog(text)).toBe(text);
  });
});
