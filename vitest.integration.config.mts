import { defineConfig, mergeConfig } from "vitest/config";

import baseConfig from "./vitest.config.mts";

// The unit-test config plus the database guard, so the integration suites that
// have always run under it keep their environment and gain the check.
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      setupFiles: ["./vitest.integration.setup.ts"],
    },
  }),
);
