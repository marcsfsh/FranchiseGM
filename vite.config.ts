import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// The shipped game makes zero network requests (spec 2.1). The policy also blocks accidental fetches.
const CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' blob:",
  'worker-src blob:',
  'child-src blob:',
  "style-src 'unsafe-inline'",
  'font-src data:',
  'img-src data: blob:',
  "base-uri 'none'",
  "form-action 'none'"
].join('; ');

/** Adds the empty font markers as the first style element (style guide 3.2) and the offline CSP. */
function shellHead(): Plugin {
  return {
    name: 'gm-shell-head',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: html =>
        html.replace(
          '<meta charset="utf-8" />',
          `<meta charset="utf-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />\n    <style>\n/* FONTS:START */\n/* FONTS:END */\n    </style>`
        )
    }
  };
}

/** Renames the single output file to dist/game.html (or dist/game-debug.html). */
function outputName(fileName: string): Plugin {
  return {
    name: 'gm-output-name',
    apply: 'build',
    enforce: 'post',
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const html = bundle['index.html'];
        if (!html || html.type !== 'asset') throw new Error('Expected index.html in the bundle');
        delete bundle['index.html'];
        this.emitFile({ type: 'asset', fileName, source: html.source });
      }
    }
  };
}

export default defineConfig(({ mode }) => {
  const debug = mode === 'debug';
  return {
    base: './',
    define: {
      __GM_DEBUG__: JSON.stringify(debug)
    },
    plugins: [viteSingleFile({ removeViteModuleLoader: true }), shellHead(), outputName(debug ? 'game-debug.html' : 'game.html')],
    worker: { format: 'iife' },
    build: {
      outDir: 'dist',
      emptyOutDir: false,
      target: ['es2022', 'safari16'],
      minify: !debug,
      cssMinify: !debug,
      sourcemap: false,
      reportCompressedSize: false,
      chunkSizeWarningLimit: 100000
    }
  };
});
