import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "jsdom",
    exclude: [...configDefaults.exclude, ".claude/worktrees/**", "e2e/**"],
    // Building a jsdom document and rendering a component tree into it costs
    // far more wall time than the assertions that follow, so the 5s default
    // leaves no headroom on a busy machine or a small CI runner.
    testTimeout: 15_000,
    hookTimeout: 15_000,
    // Each worker holds its own jsdom instance plus the module graph it
    // imported, so the pool is bound by memory rather than by CPU. The default
    // (one worker per core) oversubscribes both.
    maxWorkers: "50%",
  },
});
