import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: { __GM_DEBUG__: 'false', __GM_VERSION__: '"test"' },
  test: {
    include: [
      'tests/unit/**/*.test.ts',
      'tests/saves/**/*.test.ts',
      'tests/sim/**/*.test.ts',
      'tests/ai/**/*.test.ts'
    ],
    environment: 'node',
    pool: 'threads',
    // Sim tests play hundreds of games; a busy machine (layout tests running alongside) can take several
    // times longer than the default 5 seconds.
    testTimeout: 20_000,
    passWithNoTests: true
  }
});
