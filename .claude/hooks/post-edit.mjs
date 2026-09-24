import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
const raw = input.tool_input?.file_path;
if (!raw) process.exit(0);

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const abs = path.resolve(root, raw);
const rel = '/' + path.relative(root, abs).split(path.sep).join('/');
if (!/^\/(src|tools|tests)\/.*\.(ts|tsx|js|mjs|css|html)$/.test(rel) || !existsSync(abs)) process.exit(0);

const bin = name => path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? `${name}.cmd` : name);
const run = (name, args) => spawnSync(bin(name), args, { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' });
const problems = [];

if (existsSync(bin('prettier'))) run('prettier', ['--write', '--log-level', 'warn', abs]);

if (/\.(ts|tsx|js|mjs)$/.test(rel) && existsSync(bin('eslint'))) {
  const lint = run('eslint', ['--fix', '--format', 'unix', abs]);
  if (lint.status !== 0) {
    const out = (lint.stdout || lint.stderr || '').trim().split('\n').slice(0, 10).join('\n');
    problems.push(`ESLint problems in ${rel}:\n${out}`);
  }
}

// Style guide: UI code uses tokens. Literal colors are allowed only in the token and theme files.
const UI = /^\/src\/(app|styles)\//;
const COLOR_ALLOWED = [/^\/src\/styles\/tokens\.css$/, /^\/src\/app\/theme\//];
if (UI.test(rel) && !COLOR_ALLOWED.some(p => p.test(rel))) {
  const text = readFileSync(abs, 'utf8');
  const hits = [...text.matchAll(/(?<![\w&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6})\b/g)].map(m => m[0]);
  if (hits.length) {
    problems.push(`Literal colors in ${rel}: ${[...new Set(hits)].slice(0, 5).join(', ')}. Use style guide tokens (style guide section 12).`);
  }
}

if (problems.length) {
  process.stdout.write(JSON.stringify({ decision: 'block', reason: problems.join('\n\n') }));
}
process.exit(0);
