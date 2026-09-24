import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Style guide 14.4 gate 8: running the embedder twice succeeds and leaves the file unchanged.
describe('font embedder', () => {
  it('embeds three fonts and is idempotent', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'gm-fonts-'));
    const file = path.join(dir, 'game.html');
    writeFileSync(file, '<style>\n/* FONTS:START */\n/* FONTS:END */\nbody{}</style>');
    execFileSync('node', ['tools/embed-fonts.mjs', file], { stdio: 'ignore' });
    const once = readFileSync(file, 'utf8');
    execFileSync('node', ['tools/embed-fonts.mjs', file], { stdio: 'ignore' });
    expect(readFileSync(file, 'utf8')).toBe(once);
    expect(once.match(/@font-face/g)).toHaveLength(3);
    expect(once).toContain('SIL Open Font License');
    expect(once).toContain('body{}');
  });

  it('refuses a file without exactly one marker pair', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'gm-fonts-'));
    const file = path.join(dir, 'game.html');
    writeFileSync(file, '<style>body{}</style>');
    expect(() => execFileSync('node', ['tools/embed-fonts.mjs', file], { stdio: 'ignore' })).toThrow();
  });
});
