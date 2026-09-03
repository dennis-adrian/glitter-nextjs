import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    // A leftover git worktree under .claude/ holds a full copy of this suite;
    // without this the stale copy runs against the same test database.
    exclude: [...configDefaults.exclude, ".claude/worktrees/**", "e2e/**"],
    environment: "node",
    fileParallelism: false,
    maxWorkers: "50%",
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
