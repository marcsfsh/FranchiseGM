import { readFileSync } from 'node:fs';
import path from 'node:path';

const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
const raw = input.tool_input?.file_path;
if (!raw) process.exit(0);

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const rel = '/' + path.relative(root, path.resolve(root, raw)).split(path.sep).join('/');

const RULES = [
  [/^\/dist\//, 'dist/ is build output. Change the source and run npm run build.'],
  [/^\/data-raw\/madden-roster\.csv$/, 'The Madden roster CSV is user-supplied. Fix issues in the import mapping instead.'],
  [/^\/package-lock\.json$/, 'Change dependencies with npm install, not by editing the lockfile.'],
  [/^\/\.git\//, 'Never edit git internals.']
];

for (const [pattern, reason] of RULES) {
  if (pattern.test(rel)) {
    process.stderr.write(`Blocked edit to ${rel}: ${reason}\n`);
    process.exit(2);
  }
}
process.exit(0);
