import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'src/**/*.test.ts'],
    // simulations that must run all 2000 cycles (no steady state) or settle an envelope take up
    // to 3.5 s in a full local run, and more than Vitest's default 5 s on a busy CI runner
    testTimeout: 30_000,
  },
});
