import * as schema from "@/db/schema";
import type { Logger } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import "@/app/lib/config";

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
 * Bounds only the wait for a pooled connection, not the work that follows, so
 * it stacks with the transaction underneath it. `vercel.json` caps a function
 * at 100s, and a request still has to take its locks and run its statements
 * after checking a connection out; matching 100s here would let a request burn
 * the whole budget queueing and be killed the moment it finally acquires one.
 * 75s leaves room for the reservation write once the queue lets it through.
 */
const CONNECTION_TIMEOUT_MS = 75_000;

/**
 * A killed serverless function can leave its backend parked inside an open
 * transaction, still holding the reservation locks, until the socket is
 * reaped. Postgres ends such a session itself at this bound. No transaction
 * here does network I/O — notifications go through the outbox, which only
 * inserts job rows inside `tx` and sends afterwards — so the only gaps between
 * statements are local work, and 30s is far past any honest one.
 */
const IDLE_IN_TRANSACTION_TIMEOUT_MS = 30_000;

export const pool =
  globalForPool.__glitterPgPool ??
  (globalForPool.__glitterPgPool = new Pool({
    connectionString: process.env.POSTGRES_URL!,
    max: poolMax(),
    // Frozen serverless instances never run the reaper, but a shorter idle
    // window still returns connections between bursts on a warm instance.
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    options: `-c idle_in_transaction_session_timeout=${IDLE_IN_TRANSACTION_TIMEOUT_MS}`,
  }));

export const db = drizzle(pool, { schema, logger: redactingLogger });
