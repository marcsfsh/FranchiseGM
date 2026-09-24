import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';

const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
if (input.stop_hook_active || process.env.GM_SKIP_VERIFY === '1') process.exit(0);

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const run = (cmd, args) => spawnSync(cmd, args, { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' });
const bin = name => path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? `${name}.cmd` : name);
if (!existsSync(bin('tsc')) || !existsSync(path.join(root, 'tsconfig.json'))) process.exit(0);

const status = run('git', ['status', '--porcelain', '--untracked-files=all', '--', 'src', 'tests', 'tools']).stdout.trim();
if (!status) process.exit(0);

const files = status.split('\n').map(line => line.slice(3).split(' -> ').pop().trim());
const hash = createHash('sha1').update(status).update(run('git', ['diff', 'HEAD', '--', 'src', 'tests', 'tools']).stdout);
for (const f of files) {
  const p = path.join(root, f);
  if (existsSync(p) && statSync(p).isFile() && status.includes(`?? ${f}`)) hash.update(readFileSync(p));
}
const digest = hash.digest('hex');
const stamp = path.join(root, '.claude', '.last-verify');
if (existsSync(stamp) && readFileSync(stamp, 'utf8') === digest) process.exit(0);

const tail = (text, n) => (text || '').trim().split('\n').slice(-n).join('\n');
const fail = (title, out) => {
  process.stderr.write(`${title}. Fix this before finishing:\n${tail(out, 25)}\n`);
  process.exit(2);
};

const tsc = run(bin('tsc'), ['--noEmit', '--incremental', '--pretty', 'false', '-p', '.']);
if (tsc.status !== 0) fail('Type check failed', tsc.stdout + tsc.stderr);

const code = files.filter(f => /\.(ts|tsx|js|mjs)$/.test(f) && existsSync(path.join(root, f)));
if (code.length && existsSync(bin('vitest'))) {
  const tests = run(bin('vitest'), ['related', '--run', '--passWithNoTests', '--reporter=dot', ...code]);
  if (tests.status !== 0) fail('Unit tests failed', tests.stdout + tests.stderr);
}

writeFileSync(stamp, digest);
process.exit(0);
