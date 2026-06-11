import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // DB state is shared; run files sequentially for deterministic probes.
    fileParallelism: false,
  },
});
