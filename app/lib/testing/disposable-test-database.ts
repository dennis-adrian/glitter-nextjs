/**
 * Whether a database may be written to and emptied by an integration suite.
 *
 * The integration and migration suites truncate tables, rebuild schemas and
 * replay migrations. A name with "test" in it is not reason enough to do that
 * to a database; a deployment's can be called anything. So the target has to
 * be approved as disposable, in one of two ways, and named for testing as
 * well:
 *
 * - it is on this machine, where the disposable ones live (the Docker
 *   Postgres of `pnpm db:test:up`, the local cluster of a dev machine);
 * - or its host is listed in `GLITTER_DISPOSABLE_TEST_DB_HOSTS` (commas
 *   between hosts), which is how a CI service container on another host is
 *   approved, by whoever set that run up.
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

const TEST_NAME_RE = /(^|[_-])(test|ci)([_-]|$)/i;

/**
 * Why `url` may not be emptied by a test, or null when it may. `approvedHosts`
 * is the value of `GLITTER_DISPOSABLE_TEST_DB_HOSTS`; `variable` names the
 * environment variable `url` came from, for the message.
 */
export function disposableDatabaseProblem(
  url: string,
  approvedHosts: string | undefined,
  variable = "TEST_DATABASE_URL",
): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return `${variable} is not a URL.`;
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    return `${variable} is not a Postgres URL.`;
  }

  let databaseName: string;
  try {
    databaseName = decodeURIComponent(parsed.pathname.slice(1));
  } catch {
    return `${variable} names no database.`;
  }
  if (!TEST_NAME_RE.test(databaseName)) {
    return `${variable} must target a database whose name contains 'test' or 'ci'.`;
  }

  // `[::1]` in a URL; `::1` everywhere else.
  const host = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const approved = (approvedHosts ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  if (!LOCAL_HOSTS.has(host) && !approved.includes(host)) {
    // The host only: the rest of the URL carries the password.
    return `${variable} is on "${host}", which is not this machine and is not listed in GLITTER_DISPOSABLE_TEST_DB_HOSTS. Integration suites empty tables; they only run on a database approved as disposable.`;
  }
  return null;
}

/**
 * Throws unless `url` is unset or approved as disposable. Suites call it at
 * module level, before any connection is made; an unset URL lets them skip.
 */
export function assertDisposableTestDatabase(
  url: string | undefined,
  variable = "TEST_DATABASE_URL",
): void {
  if (!url) return;
  const problem = disposableDatabaseProblem(
    url,
    process.env.GLITTER_DISPOSABLE_TEST_DB_HOSTS,
    variable,
  );
  if (problem) throw new Error(problem);
}
