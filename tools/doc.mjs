// tools/doc.mjs: print one section of a design document, or its table of contents.
// Usage: node tools/doc.mjs <spec|build|style|tooling|post> [section | --toc]
// Examples: node tools/doc.mjs spec 11.2   node tools/doc.mjs build M4   node tools/doc.mjs style --toc
import { readFileSync } from 'node:fs';

const FILES = {
  spec: 'franchise-gm-spec.md',
  build: 'franchise-gm-build-order.md',
  style: 'franchise-gm-styleguide.md',
  tooling: 'franchise-gm-tooling.md',
  post: 'franchise-gm-post-m23.md'
};
const [key, arg = '--toc'] = process.argv.slice(2);
if (!FILES[key]) {
  console.error(`Usage: node tools/doc.mjs <${Object.keys(FILES).join('|')}> [section | --toc]`);
  process.exit(1);
}
const lines = readFileSync(new URL(`../docs/design/${FILES[key]}`, import.meta.url), 'utf8').split('\n');

const headings = [];
let inFence = false;
lines.forEach((line, i) => {
  if (/^`{3}/.test(line)) inFence = !inFence;
  const m = !inFence && /^(#{2,4})\s+(.*)$/.exec(line);
  if (m) headings.push({ i, level: m[1].length, title: m[2] });
});

if (arg === '--toc') {
  for (const h of headings) console.log(`${'  '.repeat(h.level - 2)}${h.title}`);
  process.exit(0);
}

const q = arg.toLowerCase();
const t = h => h.title.toLowerCase();
const at = headings.findIndex(h => t(h).startsWith(`${q}.`) || t(h).startsWith(`${q} `) || t(h) === q);
const found = at >= 0 ? at : headings.findIndex(h => t(h).includes(q));
if (found < 0) {
  console.error(`No section matching "${arg}". Run with --toc to list sections.`);
  process.exit(1);
}
const start = headings[found];
const next = headings.slice(found + 1).find(h => h.level <= start.level);
console.log(lines.slice(start.i, next ? next.i : lines.length).join('\n').trimEnd());
