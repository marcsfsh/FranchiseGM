import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/saves/**/*.test.ts', 'tests/ai/**/*.test.ts'],
    environment: 'node',
    pool: 'threads',
    passWithNoTests: true
  }
});
