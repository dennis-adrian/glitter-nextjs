import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { assertAppDatabaseIsTestDatabase } from "@/scripts/lib/integration-database-guard";
import integrationConfig from "@/vitest.integration.config.mts";
import reservationsIntegrationConfig from "@/vitest.reservations.integration.config.mts";

const TEST_URL = "postgres://glitter:glitter@127.0.0.1:55432/glitter_test";

describe("assertAppDatabaseIsTestDatabase", () => {
  it("does nothing when no test database is configured", () => {
    expect(() =>
      assertAppDatabaseIsTestDatabase({
        POSTGRES_URL: "postgres://u:secret@railway.example:5432/railway",
      }),
    ).not.toThrow();
  });

  it("passes when the app database is the test database", () => {
    expect(() =>
      assertAppDatabaseIsTestDatabase({
        TEST_DATABASE_URL: TEST_URL,
        POSTGRES_URL: TEST_URL,
      }),
    ).not.toThrow();
  });

  it("rejects an app database that differs from the test database", () => {
    expect(() =>
      assertAppDatabaseIsTestDatabase({
        TEST_DATABASE_URL: TEST_URL,
        POSTGRES_URL: "postgres://glitter:glitter@127.0.0.1:5432/glitter_dev",
      }),
    ).toThrow(/127\.0\.0\.1:5432\/glitter_dev.*127\.0\.0\.1:55432\/glitter_test/);
  });

  it("rejects an unset app database, which would fall back to .env.local's parts", () => {
    expect(() =>
      assertAppDatabaseIsTestDatabase({ TEST_DATABASE_URL: TEST_URL }),
    ).toThrow(/POSTGRES_URL \(\(unset\)\)/);
  });

  it("rejects a test database whose name lacks test/ci, even when both agree", () => {
    const url = "postgres://u:p@db.example:5432/glitter_staging";
    expect(() =>
      assertAppDatabaseIsTestDatabase({
        TEST_DATABASE_URL: url,
        POSTGRES_URL: url,
      }),
    ).toThrow(/must target a database whose name contains 'test' or 'ci'/);
  });

  it("never prints credentials", () => {
    let message = "";
    try {
      assertAppDatabaseIsTestDatabase({
        TEST_DATABASE_URL: TEST_URL,
        POSTGRES_URL: "postgres://u:hunter2@railway.example:6543/railway",
      });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("railway.example:6543/railway");
    expect(message).not.toContain("hunter2");
    expect(message).not.toContain("glitter:glitter");
  });
});

describe("test:integration wiring", () => {
  const pkg = JSON.parse(
    readFileSync(join(process.cwd(), "package.json"), "utf8"),
  ) as { scripts: Record<string, string> };
  const script = pkg.scripts["test:integration"]!;

  it("points app code at the same database the fixtures use", () => {
    // `node --env-file-if-exists=.env.local` never overrides a variable that is
    // already set, so exporting both here is what keeps `.env.local`'s
    // POSTGRES_URL away from the module-level `@/db` pool.
    expect(script).toContain(
      'test_db_url="postgres://glitter:glitter@127.0.0.1:${GLITTER_TEST_DB_PORT:-55432}/glitter_test"; export TEST_DATABASE_URL="$test_db_url" POSTGRES_URL="$test_db_url";',
    );
  });

  it("runs every vitest invocation under a config that loads the guard", () => {
    const configs = [...script.matchAll(/vitest\.mjs (--config (\S+) )?run /g)].map(
      (match) => match[2],
    );
    expect(configs).toEqual([
      "vitest.integration.config.mts",
      "vitest.reservations.integration.config.mts",
    ]);
    for (const config of [integrationConfig, reservationsIntegrationConfig]) {
      expect(config.test?.setupFiles).toContain("./vitest.integration.setup.ts");
    }
  });
});
