import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: { __GM_DEBUG__: 'false', __GM_VERSION__: '"test"' },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/saves/**/*.test.ts', 'tests/ai/**/*.test.ts'],
    environment: 'node',
    pool: 'threads',
    passWithNoTests: true
  }
});
