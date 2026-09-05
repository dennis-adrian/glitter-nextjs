import * as schema from "@/db/schema";
import type { Logger } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import "@/app/lib/config";
import { getPostgresUrl } from "@/env";

function redactQueryParams(query: string, params: unknown[]): unknown[] {
  if (!/external_participants/i.test(query)) {
    return params;
  }

  return params.map((param) => {
    if (typeof param !== "string") {
      return param;
    }
    if (param.includes("@")) {
      return "[REDACTED_EMAIL]";
    }
    if (/^\+?[\d\s().-]{8,}$/.test(param)) {
      return "[REDACTED_PHONE]";
    }
    return param;
  });
}

const redactingLogger: Logger = {
  logQuery(query: string, params: unknown[]) {
    console.log({ query, params: redactQueryParams(query, params) });
  },
};

/**
 * Turbopack compiles this module once per server layer, so the build carries
 * two copies of it (`chunks/db_index_ts_*` for RSC, `chunks/ssr/db_index_ts_*`
 * for SSR). A plain module-level pool therefore becomes two pools in one Node
 * process, each opening up to `max` connections. Hanging it off `globalThis`
 * keeps both copies on a single set of connections.
 */
const globalForPool = globalThis as typeof globalThis & {
  __glitterPgPool?: Pool;
};

/**
 * Serverless multiplies whatever this is by the number of live instances, so a
 * generous per-instance pool exhausts the server's `max_connections` long
 * before it helps. Not lower than this: reservation writes hold a transaction's
 * connection while other reads run, and too tight a cap turns that into the
 * self-deadlock `full-table-service` and `feature-config-service` guard against.
 */
const DEFAULT_POOL_MAX = 5;

function poolMax(): number {
  const configured = Number(process.env.POSTGRES_POOL_MAX);
  // Integers only: pg admits clients while `length >= max`, so a fractional
  // value rounds *up* (2.5 yields 3). This knob exists to shed connections
  // under pressure, and quietly handing back more than asked for defeats it.
  return Number.isInteger(configured) && configured > 0
    ? configured
    : DEFAULT_POOL_MAX;
}

/**
 * Bounds two separate waits, both armed with this same value: queueing for a
 * pooled connection, and establishing a brand-new TCP/TLS one. Neither covers
 * the transaction that follows, so it stacks with that work under
 * `vercel.json`'s 100s function cap — matching 100s here would let a request
 * burn the whole budget waiting and be killed the moment it acquires a
 * connection. Note the second arming: while the database is unreachable every
 * invocation spends the full budget before erroring rather than failing fast.
 */
const CONNECTION_TIMEOUT_MS = 75_000;

/**
 * A killed serverless function can leave its backend parked inside an open
 * transaction, still holding the reservation locks, until the socket is
 * reaped. Postgres ends such a session itself at this bound.
 *
 * Deliberately above the 100s function cap. Several transactions do await
 * network I/O while open — Resend in `festival_activites/actions.ts` and
 * `profile_tasks/actions.ts`, UploadThing in `products/scheduled-actions.ts` —
 * so a bound below the cap would tear down a live transaction mid-flight and
 * roll back writes whose side effects had already left the process. Above the
 * cap it can only ever reach a session whose function is already dead, which
 * is the only case it is meant to catch.
 */
const IDLE_IN_TRANSACTION_TIMEOUT_MS = 120_000;

function createPool(): Pool {
  const created = new Pool({
    // Not `process.env.POSTGRES_URL` directly: `env.ts` also blesses the
    // four-part POSTGRES_USER/PASSWORD/HOST/DATABASE shape that local dev
    // uses, and pg would silently fall through to PGHOST defaults for it.
    connectionString: getPostgresUrl(),
    max: poolMax(),
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    // A first-class client field, not the raw libpq `options` string: pg
    // merges the parsed connection string *over* this config and copies every
    // search param, so an `options` in the URL would silently drop the bound.
    idle_in_transaction_session_timeout: IDLE_IN_TRANSACTION_TIMEOUT_MS,
  });

  // pg-pool re-attaches an idle listener to every parked client and that
  // listener ends in `pool.emit('error')`. Without a subscriber an
  // EventEmitter turns that into ERR_UNHANDLED_ERROR and takes the process
  // down, so a Railway restart or a socket reaped during the idle window
  // would kill the instance rather than retire one connection. Attached here
  // rather than beside the export so the second module layer, which reuses
  // the pool through the global, does not add a duplicate listener.
  created.on("error", (error) => {
    console.error("Postgres pool error (client discarded)", error);
  });

  return created;
}

export const pool =
  globalForPool.__glitterPgPool ??
  (globalForPool.__glitterPgPool = createPool());

export const db = drizzle(pool, { schema, logger: redactingLogger });
