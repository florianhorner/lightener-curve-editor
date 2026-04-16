import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.bench.ts',
        // lightener-curve-card.ts is the god-file under active extraction (PR-B).
        // Its render methods are covered by regression and lightener-panel tests
        // indirectly, but not by unit tests. Exclude from the gate until PR-B
        // shrinks it and raises coverage organically.
        'src/lightener-curve-card.ts',
      ],
      reporter: ['text', 'html', 'lcov'],
      thresholds: {
        lines: 78,
        branches: 68,
        functions: 78,
        statements: 78,
      },
    },
  },
});
