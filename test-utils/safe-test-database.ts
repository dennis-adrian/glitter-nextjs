import { Client } from "pg";

/**
 * The backstop that keeps a destructive integration suite off a real
 * database: it may only run against one whose name says it is for tests.
 *
 * The name checked is the one pg will actually select, not the URL's path.
 * The two differ more than they look:
 *
 * - `socket:/var/run/pg-test?db=prod` keeps the socket directory in the path
 *   and the database in `?db=`;
 * - `postgres://%2Fvar%2Frun%2Fpg/prod` and `postgres:///prod?host=/var/run/pg`
 *   reach a Unix socket, and `?host=` can point any URL at another server;
 * - a URL with no database makes pg fall back to `PGDATABASE`, then to the
 *   user (`PGUSER`, then `USER`).
 *
 * Constructing a `Client` only parses the connection string and applies those
 * fallbacks; it does not connect.
 */

const TEST_NAME_RE = /(^|[_-])(test|ci)([_-]|$)/i;

/** Hosts where the disposable databases live: this machine and Docker's host. */
export const LOCAL_TEST_HOSTS: ReadonlySet<string> = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
  "host.docker.internal",
]);

export interface PgTarget {
  host: string | undefined;
  database: string | undefined;
}

/**
 * The host and database pg selects for `url`, fallbacks applied, or null when
 * pg cannot use it.
 */
export function resolvePgTarget(url: string): PgTarget | null {
  try {
    const client = new Client({ connectionString: url });
    const host = typeof client.host === "string" ? client.host : undefined;
    const database =
      typeof client.database === "string" ? client.database : undefined;
    return { host, database };
  } catch {
    return null;
  }
}

export interface SafeTestDatabaseOptions {
  /** Also require the host pg connects to to be one of `LOCAL_TEST_HOSTS`. */
  localOnly?: boolean;
  /**
   * Also require a plain `postgres://` URL that names its host and carries no
   * query string or fragment, so nothing in it is left to interpretation.
   */
  plainUrl?: boolean;
}

/**
 * Whether a destructive suite may run against `url`: the database pg selects
 * for it must have `test` or `ci` in its name, as a `_`/`-`-separated word.
 */
export function isSafeTestDatabase(
  url: string,
  options: SafeTestDatabaseOptions = {},
): boolean {
  if (options.plainUrl) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return false;
    }
    if (!["postgres:", "postgresql:"].includes(parsed.protocol)) return false;
    if (parsed.search !== "" || parsed.hash !== "") return false;
    if (parsed.hostname === "") return false;
  }

  const target = resolvePgTarget(url);
  if (!target?.database || !TEST_NAME_RE.test(target.database)) return false;
  if (options.localOnly) {
    return (
      target.host !== undefined &&
      LOCAL_TEST_HOSTS.has(target.host.toLowerCase())
    );
  }
  return true;
}
