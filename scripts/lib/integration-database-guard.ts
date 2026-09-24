import { isTestOrCiDatabaseUrl } from "./sync-env-local";

/** host:port/database, never the credentials the URL carries. */
function databaseLabel(url: string | undefined): string {
  if (!url) return "(unset)";
  try {
    const parsed = new URL(url);
    const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
    return `${parsed.hostname}:${parsed.port || "5432"}/${database || "(none)"}`;
  } catch {
    return "(unparseable)";
  }
}

/**
 * Integration suites write fixtures through their own `TEST_DATABASE_URL`
 * pool, but the app code they exercise goes through the module-level `@/db`
 * pool, which reads `POSTGRES_URL` once, when `@/db` is first imported.
 * `test:integration` loads `.env.local` into the process, so unless the two
 * agree, fixtures land in the test database while app code reads and writes
 * whatever `.env.local` points at — which has been Railway.
 *
 * No-op without `TEST_DATABASE_URL`: every suite skips itself then.
 */
export function assertAppDatabaseIsTestDatabase(
  env: NodeJS.ProcessEnv = process.env,
): void {
  const testDatabaseUrl = env.TEST_DATABASE_URL;
  if (!testDatabaseUrl) return;

  if (!isTestOrCiDatabaseUrl(testDatabaseUrl)) {
    throw new Error(
      `TEST_DATABASE_URL (${databaseLabel(testDatabaseUrl)}) must target a database whose name contains 'test' or 'ci'.`,
    );
  }
  if (env.POSTGRES_URL !== testDatabaseUrl) {
    throw new Error(
      `POSTGRES_URL (${databaseLabel(env.POSTGRES_URL)}) does not match TEST_DATABASE_URL (${databaseLabel(testDatabaseUrl)}). ` +
        "App code under test would run against POSTGRES_URL. Run the suites through `pnpm test:integration`, " +
        "or export POSTGRES_URL to the same value.",
    );
  }
}
