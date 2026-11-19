/**
 * Whether a database may be emptied by a test.
 *
 * The links integration suite takes `site_links` and `site_links_settings`
 * over whole: it empties both before every test. A name with "test" in it is
 * not reason enough to do that to a database; a deployment's can be called
 * anything. So the target has to be approved as disposable, in one of two
 * ways, and named for testing as well:
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
 * is the value of `GLITTER_DISPOSABLE_TEST_DB_HOSTS`.
 */
export function disposableDatabaseProblem(
  url: string,
  approvedHosts: string | undefined,
): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "TEST_DATABASE_URL is not a URL.";
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    return "TEST_DATABASE_URL is not a Postgres URL.";
  }

  let databaseName: string;
  try {
    databaseName = decodeURIComponent(parsed.pathname.slice(1));
  } catch {
    return "TEST_DATABASE_URL names no database.";
  }
  if (!TEST_NAME_RE.test(databaseName)) {
    return "TEST_DATABASE_URL must target a database whose name contains 'test' or 'ci'.";
  }

  // The host that is checked below has to be the host that is connected to.
  // `pg` reads a `host` in the query string over the one in the address
  // (a name, or a Unix socket's directory), so
  // `postgres://…@127.0.0.1/x_test?host=db.example.com` would pass as local
  // and connect elsewhere. `hostaddr` is libpq's way to say the same thing.
  for (const name of parsed.searchParams.keys()) {
    const parameter = name.toLowerCase();
    if (parameter === "host" || parameter === "hostaddr") {
      return `TEST_DATABASE_URL sets "${parameter}" in its query string, which can send the connection somewhere other than the host in the address. Put the host in the address itself.`;
    }
  }

  // `[::1]` in a URL; `::1` everywhere else.
  const host = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const approved = (approvedHosts ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  if (!LOCAL_HOSTS.has(host) && !approved.includes(host)) {
    // The host only: the rest of the URL carries the password.
    return `TEST_DATABASE_URL is on "${host}", which is not this machine and is not listed in GLITTER_DISPOSABLE_TEST_DB_HOSTS. This suite empties tables; it only runs on a database approved as disposable.`;
  }
  return null;
}

/**
 * The advisory lock the links integration suites hold while they run: one
 * empties `site_links` before every test, the other adds links of its own,
 * and the two must never run at once.
 */
export const LINKS_SUITE_LOCK = 731_400_313;
