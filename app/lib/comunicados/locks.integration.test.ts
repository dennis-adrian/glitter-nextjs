// @vitest-environment node

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";

/**
 * The comunicado content lock (docs/IMPLEMENTATION-comunicados.md D2, D3, F3)
 * against a real database: fan-out chunks and email batches take it shared,
 * so they run side by side, and a retraction takes it exclusive, so it waits
 * for them and they for it. It is keyed by comunicado id, so one comunicado
 * never holds up another. The ids are far above any fixture's, and nothing
 * here writes a row.
 */

vi.mock("server-only", () => ({}));

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

function isSafeTestDatabase(url: string): boolean {
  try {
    return /(^|[_-])(test|ci)([_-]|$)/i.test(
      decodeURIComponent(new URL(url).pathname.slice(1)),
    );
  } catch {
    return false;
  }
}

if (testDatabaseUrl && !isSafeTestDatabase(testDatabaseUrl)) {
  throw new Error(
    "TEST_DATABASE_URL must target a database whose name contains 'test' or 'ci'.",
  );
}

const pool = testDatabaseUrl
  ? new Pool({ connectionString: testDatabaseUrl, max: 4 })
  : null;
const integrationDb = pool ? drizzle(pool, { schema }) : null;
const describeDatabase = integrationDb ? describe : describe.skip;

type Locks = typeof import("@/app/lib/comunicados/locks");
type Tx = Parameters<
  Parameters<NonNullable<typeof integrationDb>["transaction"]>[0]
>[0];
let locks: Locks;

const COMUNICADO = 2_147_480_001;
const OTHER = 2_147_480_002;

/** Another connection's attempt, which never waits: true when it got it. */
async function tryLock(mode: "shared" | "exclusive", comunicadoId: number) {
  const client = await pool!.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ locked: boolean }>(
      mode === "shared"
        ? "SELECT pg_try_advisory_xact_lock_shared($1::int, $2::int) AS locked"
        : "SELECT pg_try_advisory_xact_lock($1::int, $2::int) AS locked",
      [locks.COMUNICADO_LOCK_NS, comunicadoId],
    );
    return rows[0]!.locked;
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}

/** Another connection holding a lock until the returned function lets go. */
async function holdLock(mode: "shared" | "exclusive", comunicadoId: number) {
  const client = await pool!.connect();
  await client.query("BEGIN");
  await client.query(
    mode === "shared"
      ? "SELECT pg_advisory_xact_lock_shared($1::int, $2::int)"
      : "SELECT pg_advisory_xact_lock($1::int, $2::int)",
    [locks.COMUNICADO_LOCK_NS, comunicadoId],
  );
  let released: Promise<void> | null = null;
  const release = () =>
    (released ??= client
      .query("ROLLBACK")
      .then(() => undefined)
      .finally(() => client.release()));
  // A failing test cannot leave the lock behind for the next one.
  const timer = setTimeout(() => void release(), 10_000);
  return () => {
    clearTimeout(timer);
    return release();
  };
}

/** The comunicado locks this transaction's own connection holds. */
async function heldLocks(tx: Tx) {
  const { rows } = await tx.execute<{ comunicado_id: number; mode: string }>(
    sql`SELECT objid::int AS comunicado_id, mode FROM pg_locks
        WHERE locktype = 'advisory' AND classid = ${locks.COMUNICADO_LOCK_NS}
          AND objsubid = 2 AND granted AND pid = pg_backend_pid()
        ORDER BY objid`,
  );
  return rows;
}

async function waitUntilWaiting(comunicadoId: number) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const { rows } = await pool!.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_locks
       WHERE locktype = 'advisory' AND classid = $1 AND objid = $2
         AND objsubid = 2 AND NOT granted`,
      [locks.COMUNICADO_LOCK_NS, comunicadoId],
    );
    if (rows[0]!.n > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Nobody waited for the comunicado lock.");
}

describeDatabase("comunicado content lock", () => {
  beforeAll(async () => {
    locks = await import("@/app/lib/comunicados/locks");
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("is shared: chunks and batches of one comunicado run together", async () => {
    await integrationDb!.transaction(async (tx) => {
      await locks.lockComunicadoShared(tx, COMUNICADO);

      expect(await heldLocks(tx)).toEqual([
        { comunicado_id: COMUNICADO, mode: "ShareLock" },
      ]);
      expect(await tryLock("shared", COMUNICADO)).toBe(true);
      expect(await tryLock("exclusive", COMUNICADO)).toBe(false);
    });

    // A transaction lock: it ends with the transaction.
    expect(await tryLock("exclusive", COMUNICADO)).toBe(true);
  });

  it("is exclusive for a retraction, which waits for every batch", async () => {
    const releaseBatch = await holdLock("shared", COMUNICADO);
    let locked = false;

    const retraction = integrationDb!.transaction(async (tx) => {
      await locks.lockComunicadoExclusive(tx, COMUNICADO);
      locked = true;
      expect(await heldLocks(tx)).toEqual([
        { comunicado_id: COMUNICADO, mode: "ExclusiveLock" },
      ]);
      // Nor does a chunk start while it holds the lock.
      expect(await tryLock("shared", COMUNICADO)).toBe(false);
    });

    try {
      await waitUntilWaiting(COMUNICADO);
      expect(locked).toBe(false);
    } finally {
      await releaseBatch();
    }
    await retraction;
    expect(locked).toBe(true);
  });

  it("is keyed by comunicado: another one's retraction holds nothing up", async () => {
    const releaseRetraction = await holdLock("exclusive", COMUNICADO);
    try {
      await integrationDb!.transaction(async (tx) => {
        // Fails fast instead of hanging if the keys ever collide.
        await tx.execute(sql`SET LOCAL lock_timeout = '2s'`);
        await locks.lockComunicadoShared(tx, OTHER);
        await locks.lockComunicadoExclusive(tx, OTHER);

        expect(await heldLocks(tx)).toEqual([
          { comunicado_id: OTHER, mode: "ShareLock" },
          { comunicado_id: OTHER, mode: "ExclusiveLock" },
        ]);
      });
    } finally {
      await releaseRetraction();
    }
  });
});
