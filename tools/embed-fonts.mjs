// tools/embed-fonts.mjs
// Reads the woff2 files, base64-encodes them, and writes the @font-face block
// into the built HTML file (default dist/game.html) between the FONTS:START and FONTS:END markers.
import { readFile, writeFile } from 'node:fs/promises';

const LATIN =
  'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';
const FONTS = [
  {
    family: 'Barlow Condensed',
    weight: '700',
    style: 'normal',
    file: 'node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-700-normal.woff2'
  },
  {
    family: 'Barlow Condensed',
    weight: '800',
    style: 'italic',
    file: 'node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-800-italic.woff2'
  },
  {
    family: 'Overpass',
    weight: '100 900',
    style: 'normal',
    file: 'node_modules/@fontsource-variable/overpass/files/overpass-latin-wght-normal.woff2'
  }
];

const licenses = [];
for (const pkg of ['@fontsource/barlow-condensed', '@fontsource-variable/overpass']) {
  let license = null;
  for (const filename of ['LICENSE', 'LICENSE.txt', 'OFL.txt']) {
    try {
      license = await readFile(`node_modules/${pkg}/${filename}`, 'utf8');
      break;
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
  }
  if (!license)
    throw new Error(`Missing font license in ${pkg}; locate its package license before distributing.`);
  // Avoid terminating the CSS comment or enclosing HTML style element.
  const safe = license.replaceAll('*/', '* /').replace(/<\/style/gi, '< /style');
  licenses.push(`/* ${pkg}\n${safe}\n*/`);
}
const blocks = [];
for (const f of FONTS) {
  const b64 = (await readFile(f.file)).toString('base64');
  blocks.push(
    `@font-face {
  font-family: '${f.family}';
  font-style: ${f.style};
  font-weight: ${f.weight};
  font-display: swap;
  src: url(data:font/woff2;base64,${b64}) format('woff2');
  unicode-range: ${LATIN};
}`
  );
}
const css = `/* FONTS:START */
/* Barlow Condensed and Overpass, SIL Open Font License 1.1 (https://openfontlicense.org) */
${licenses.join('\n')}
${blocks.join('\n')}
/* FONTS:END */`;

const target = process.argv[2] ?? 'dist/game.html';
const html = await readFile(target, 'utf8');
const startMarker = '/* FONTS:START */',
  endMarker = '/* FONTS:END */';
if (
  html.split(startMarker).length !== 2 ||
  html.split(endMarker).length !== 2 ||
  html.indexOf(startMarker) >= html.indexOf(endMarker)
) {
  throw new Error('Expected exactly one ordered FONTS:START / FONTS:END marker pair');
}
const out = html.replace(/\/\* FONTS:START \*\/[\s\S]*?\/\* FONTS:END \*\//, () => css);
await writeFile(target, out);
console.log('Embedded', FONTS.length, 'fonts,', Math.round(css.length / 1024), 'KB of CSS');
