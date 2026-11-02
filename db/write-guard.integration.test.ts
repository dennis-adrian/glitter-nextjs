// @vitest-environment node

import { randomUUID } from "crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";
import { users } from "@/db/schema";

/**
 * The read-only guard on a real pool and a real database
 * (docs/PLAN-impersonation.md §6.1): Drizzle's reads, writes, transactions,
 * raw SQL and `pool.query` all go through it. Only this file's own rows are
 * read or removed.
 */

const { viewState } = vi.hoisted(() => ({
  viewState: { inRequest: true, cookie: false, viewing: false },
}));

vi.mock("next/headers", () => ({
  cookies: async () => {
    if (!viewState.inRequest) throw new Error("outside a request scope");
    return { has: () => viewState.cookie };
  },
}));
vi.mock("@/app/lib/impersonation/viewer", () => ({
  isImpersonating: async () => viewState.viewing,
  getImpersonation: async () => null,
}));

import { allowImpersonationWrites, installWriteGuard } from "@/db/write-guard";

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
  ? installWriteGuard(new Pool({ connectionString: testDatabaseUrl, max: 2 }))
  : null;
const guardedDb = pool ? drizzle(pool, { schema }) : null;
const describeDatabase = guardedDb ? describe : describe.skip;

const prefix = `guard-${randomUUID()}`;
const created: number[] = [];

function newUser() {
  const suffix = randomUUID();
  return {
    clerkId: `${prefix}-${suffix}`,
    email: `${prefix}-${suffix}@example.com`,
  };
}

async function countMine() {
  const rows = await guardedDb!
    .select({ id: users.id })
    .from(users)
    .where(sql`${users.clerkId} like ${`${prefix}-%`}`);
  return rows.length;
}

function view(viewing: boolean) {
  viewState.inRequest = true;
  viewState.cookie = true;
  viewState.viewing = viewing;
}

describeDatabase("read-only guard on a real pool", () => {
  beforeEach(() => {
    viewState.inRequest = true;
    viewState.cookie = false;
    viewState.viewing = false;
  });

  afterAll(async () => {
    if (!guardedDb) return;
    viewState.viewing = false;
    await guardedDb
      .delete(users)
      .where(sql`${users.clerkId} like ${`${prefix}-%`}`);
    await pool!.end();
  });

  it("lets every write through for an ordinary request", async () => {
    const [row] = await guardedDb!
      .insert(users)
      .values(newUser())
      .returning({ id: users.id });
    created.push(row!.id);
    await guardedDb!
      .update(users)
      .set({ bio: "hola" })
      .where(eq(users.id, row!.id));
    expect(await countMine()).toBe(1);
  });

  it("lets every write through outside a request (scripts)", async () => {
    viewState.inRequest = false;
    viewState.viewing = true;
    const [row] = await guardedDb!
      .insert(users)
      .values(newUser())
      .returning({ id: users.id });
    created.push(row!.id);
    expect(await countMine()).toBe(2);
  });

  it("reads during a view", async () => {
    view(true);
    expect(await countMine()).toBe(2);
    const rows = await guardedDb!.query.users.findMany({
      where: inArray(users.id, created),
    });
    expect(rows).toHaveLength(2);
  });

  it("refuses an insert, an update and a delete during a view", async () => {
    view(true);
    await expect(
      guardedDb!.insert(users).values(newUser()),
    ).rejects.toMatchObject({ cause: { code: "IMPERSONATION_READ_ONLY" } });
    await expect(
      guardedDb!
        .update(users)
        .set({ bio: "no" })
        .where(eq(users.id, created[0]!)),
    ).rejects.toMatchObject({ cause: { code: "IMPERSONATION_READ_ONLY" } });
    await expect(
      guardedDb!.delete(users).where(eq(users.id, created[0]!)),
    ).rejects.toMatchObject({ cause: { code: "IMPERSONATION_READ_ONLY" } });

    viewState.viewing = false;
    expect(await countMine()).toBe(2);
    const [row] = await guardedDb!
      .select({ bio: users.bio })
      .from(users)
      .where(eq(users.id, created[0]!));
    expect(row?.bio).toBe("hola");
  });

  it("rolls a transaction back when a write in it is refused", async () => {
    view(true);
    await expect(
      guardedDb!.transaction(async (tx) => {
        await tx.select().from(users).where(eq(users.id, created[0]!));
        await tx.insert(users).values(newUser());
      }),
    ).rejects.toBeTruthy();
    viewState.viewing = false;
    expect(await countMine()).toBe(2);
  });

  it("refuses a data-modifying CTE sent as raw SQL", async () => {
    view(true);
    await expect(
      guardedDb!.execute(
        sql`with gone as (delete from ${users} where ${users.id} = ${created[0]!} returning id) select count(*) from gone`,
      ),
    ).rejects.toBeTruthy();
    viewState.viewing = false;
    expect(await countMine()).toBe(2);
  });

  it("refuses a write through pool.query, and the pool keeps working", async () => {
    view(true);
    await expect(
      pool!.query("delete from users where clerk_id like $1", [`${prefix}-%`]),
    ).rejects.toMatchObject({ code: "IMPERSONATION_READ_ONLY" });
    const { rows } = await pool!.query(
      "select count(*)::int as n from users where clerk_id like $1",
      [`${prefix}-%`],
    );
    expect(rows[0].n).toBe(2);
  });

  it("lets the view's own bookkeeping write", async () => {
    view(true);
    await allowImpersonationWrites(() =>
      guardedDb!
        .update(users)
        .set({ bio: "contado" })
        .where(eq(users.id, created[0]!)),
    );
    const [row] = await guardedDb!
      .select({ bio: users.bio })
      .from(users)
      .where(eq(users.id, created[0]!));
    expect(row?.bio).toBe("contado");
  });

  it("keeps the bookkeeping scope across a brand-new connection", async () => {
    view(true);
    // A fresh pool: the write waits for a socket to open, and pg-pool hands
    // the client over from that socket's callback.
    const fresh = installWriteGuard(
      new Pool({ connectionString: testDatabaseUrl, max: 1 }),
    );
    const freshDb = drizzle(fresh, { schema });
    try {
      await allowImpersonationWrites(() =>
        freshDb
          .update(users)
          .set({ bio: "nueva conexión" })
          .where(eq(users.id, created[0]!)),
      );
      await expect(
        freshDb
          .update(users)
          .set({ bio: "no" })
          .where(eq(users.id, created[0]!)),
      ).rejects.toMatchObject({ cause: { code: "IMPERSONATION_READ_ONLY" } });
    } finally {
      await fresh.end();
    }
    const [row] = await guardedDb!
      .select({ bio: users.bio })
      .from(users)
      .where(eq(users.id, created[0]!));
    expect(row?.bio).toBe("nueva conexión");
  });

  it("keeps the bookkeeping scope when the write waits for a busy pool", async () => {
    view(true);
    // One connection, held by a transaction: the allowed write queues in
    // pg-pool, and the client reaches it from the transaction's release, in
    // the transaction's async context.
    const busy = installWriteGuard(
      new Pool({ connectionString: testDatabaseUrl, max: 1 }),
    );
    const busyDb = drizzle(busy, { schema });
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    try {
      const holder = busyDb.transaction(async (tx) => {
        await tx.select({ id: users.id }).from(users).limit(1);
        await held;
      });
      // Give the transaction time to take the only connection.
      await new Promise((resolve) => setTimeout(resolve, 50));
      const allowedWrite = allowImpersonationWrites(() =>
        busyDb
          .update(users)
          .set({ bio: "en cola" })
          .where(eq(users.id, created[0]!)),
      );
      const refusedWrite = busyDb
        .update(users)
        .set({ bio: "no" })
        .where(eq(users.id, created[0]!));
      release();
      await holder;
      await allowedWrite;
      await expect(refusedWrite).rejects.toMatchObject({
        cause: { code: "IMPERSONATION_READ_ONLY" },
      });
    } finally {
      await busy.end();
    }
    const [row] = await guardedDb!
      .select({ bio: users.bio })
      .from(users)
      .where(eq(users.id, created[0]!));
    expect(row?.bio).toBe("en cola");
  });

  it("lets the admin's own writes through when the cookie opens no view", async () => {
    view(false);
    await guardedDb!
      .update(users)
      .set({ bio: "admin" })
      .where(eq(users.id, created[0]!));
    const [row] = await guardedDb!
      .select({ bio: users.bio })
      .from(users)
      .where(eq(users.id, created[0]!));
    expect(row?.bio).toBe("admin");
  });
});
