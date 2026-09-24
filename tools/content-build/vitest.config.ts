import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // run.test.mjs uses node:test, and runs through the root `test:scripts`.
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // The CLIs only print what validateContent and build return.
      exclude: ['src/**/*.test.ts', 'src/cli.ts', 'src/build-cli.ts'],
      reporter: ['text', 'lcov'],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
