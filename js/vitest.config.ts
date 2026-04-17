import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.bench.ts',
        // lightener-curve-card.ts is the god-file under active extraction.
        // Its render methods are covered by regression and lightener-panel tests
        // indirectly, but not by unit tests. PR-A extracted per-component tests;
        // PR-B extracted the save-lifecycle reducer. Re-include when the card
        // is under 400 lines and can be covered directly.
        'src/lightener-curve-card.ts',
      ],
      reporter: ['text', 'html', 'lcov'],
      // Floor, not ratchet: baseline after PR-B is 82.52/73.76/83.47/80.52
      // (lines/branches/functions/statements) with the card excluded.
      // Set 3-6pp below to allow legitimate refactor churn without false CI fails.
      thresholds: {
        lines: 75,
        branches: 65,
        functions: 75,
        statements: 75,
      },
    },
  },
});
