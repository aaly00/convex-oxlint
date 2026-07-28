import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 300_000,
    hookTimeout: 300_000,
    // The parity suites shell out to the oxlint binary; running them in
    // parallel would make each spawn contend for the same CPU pool.
    fileParallelism: false,
    // Keeps the runtime notice out of test output; the packaged e2e suite
    // clears this explicitly for the subprocesses that assert on it.
    env: { CONVEX_OXLINT_SILENCE_TYPE_AWARE_NOTICE: "1" },
  },
});
