// @vitest-environment node

import { randomUUID } from "crypto";
import { eq, inArray, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";
import {
  impersonationSessions,
  pendingUserDeletions,
  users,
} from "@/db/schema";

/**
 * "Entrar como participante" sessions against a real database
 * (docs/PLAN-impersonation.md §4, §5). Every assertion is about this file's
 * own fixtures, never a total over the shared database.
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
const testDb = pool ? drizzle(pool, { schema }) : null;
const describeDatabase = testDb ? describe : describe.skip;

type Queries = typeof import("@/app/lib/impersonation/queries");
let queries: Queries;

const createdUsers: number[] = [];

async function createUser(
  values: Partial<typeof users.$inferInsert> = {},
): Promise<typeof users.$inferSelect> {
  const suffix = randomUUID();
  const [user] = await testDb!
    .insert(users)
    .values({
      clerkId: `view-as-${suffix}`,
      email: `view-as-${suffix}@example.com`,
      displayName: `Vista ${suffix.slice(0, 8)}`,
      role: "user",
      status: "verified",
      ...values,
    })
    .returning();
  createdUsers.push(user!.id);
  return user!;
}

type Person = typeof users.$inferSelect;

async function open(
  admin: Person,
  subject: Person,
  overrides: { sessionId?: string; returnTo?: string | null } = {},
) {
  const tokenHash = randomUUID();
  const adminClerkSessionId = overrides.sessionId ?? `sess_${randomUUID()}`;
  const row = await queries.createImpersonationSession(
    {
      adminUserId: admin.id,
      adminClerkId: admin.clerkId,
      subjectUserId: subject.id,
      subjectClerkId: subject.clerkId,
      adminClerkSessionId,
      tokenHash,
      returnTo: overrides.returnTo ?? null,
    },
    testDb!,
  );
  return { ...row!, tokenHash, adminClerkSessionId };
}

/** Moves a view an hour and a minute into the past, so it reads as expired. */
async function expire(id: number) {
  await testDb!
    .update(impersonationSessions)
    .set({
      startedAt: sql`now() - interval '61 minutes'`,
      expiresAt: sql`now() - interval '1 minute'`,
    })
    .where(eq(impersonationSessions.id, id));
}

async function stateOf(id: number) {
  const [row] = await testDb!
    .select()
    .from(impersonationSessions)
    .where(eq(impersonationSessions.id, id));
  return row!;
}

describeDatabase("impersonation sessions", () => {
  let admin: Person;
  let otherAdmin: Person;
  let subject: Person;

  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl!;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";
    queries = await import("@/app/lib/impersonation/queries");

    admin = await createUser({ role: "admin", displayName: "Admin vista" });
    otherAdmin = await createUser({ role: "admin" });
    subject = await createUser({ displayName: "Participante vista" });
  });

  afterAll(async () => {
    if (!testDb) return;
    if (createdUsers.length > 0) {
      await testDb
        .delete(impersonationSessions)
        .where(
          or(
            inArray(impersonationSessions.adminUserId, createdUsers),
            inArray(impersonationSessions.subjectUserId, createdUsers),
          ),
        );
      // Rows whose profiles were deleted mid-test only keep the Clerk ids.
      await testDb
        .delete(impersonationSessions)
        .where(sql`${impersonationSessions.adminClerkId} like 'view-as-%'`);
      await testDb
        .delete(pendingUserDeletions)
        .where(inArray(pendingUserDeletions.userId, createdUsers));
      await testDb.delete(users).where(inArray(users.id, createdUsers));
    }
    await pool?.end();
  });

  describe("createImpersonationSession", () => {
    it("opens a view that ends an hour later by the database's clock", async () => {
      const view = await open(admin, subject);
      const [{ seconds }] = (
        await testDb!.execute<{ seconds: string }>(
          sql`select extract(epoch from (${impersonationSessions.expiresAt} - ${impersonationSessions.startedAt}))::text as seconds
              from ${impersonationSessions} where ${impersonationSessions.id} = ${view.id}`,
        )
      ).rows;
      expect(Number(seconds)).toBe(3600);
      const row = await stateOf(view.id);
      expect(row.endedAt).toBeNull();
      expect(row.blockedWrites).toBe(0);
    });

    it("refuses a view of yourself, even past the action's check", async () => {
      await expect(open(admin, admin)).rejects.toThrow();
    });

    it("refuses a return path outside the dashboard", async () => {
      await expect(
        open(admin, subject, { returnTo: "https://evil.example/" }),
      ).rejects.toThrow();
      await expect(
        open(admin, subject, { returnTo: "//evil.example/dashboard" }),
      ).rejects.toThrow();
    });

    it("refuses a token that is already in use", async () => {
      const view = await open(admin, subject);
      await expect(
        queries.createImpersonationSession(
          {
            adminUserId: admin.id,
            adminClerkId: admin.clerkId,
            subjectUserId: subject.id,
            subjectClerkId: subject.clerkId,
            adminClerkSessionId: view.adminClerkSessionId,
            tokenHash: view.tokenHash,
            returnTo: null,
          },
          testDb!,
        ),
      ).rejects.toThrow();
    });
  });

  describe("findLiveImpersonation", () => {
    it("resolves a live view to both profiles", async () => {
      const view = await open(admin, subject);
      const live = await queries.findLiveImpersonation(view, testDb!);
      expect(live?.session.id).toBe(view.id);
      expect(live?.admin.id).toBe(admin.id);
      expect(live?.subject.id).toBe(subject.id);
      expect(live?.secondsLeft).toBeGreaterThan(3500);
      expect(live?.secondsLeft).toBeLessThanOrEqual(3600);
    });

    it("does not resolve for another Clerk session", async () => {
      const view = await open(admin, subject);
      expect(
        await queries.findLiveImpersonation(
          { tokenHash: view.tokenHash, adminClerkSessionId: "sess_other" },
          testDb!,
        ),
      ).toBeNull();
    });

    it("does not resolve an unknown token", async () => {
      const view = await open(admin, subject);
      expect(
        await queries.findLiveImpersonation(
          {
            tokenHash: randomUUID(),
            adminClerkSessionId: view.adminClerkSessionId,
          },
          testDb!,
        ),
      ).toBeNull();
    });

    it("does not resolve once expired or ended", async () => {
      const expired = await open(admin, subject);
      await expire(expired.id);
      expect(await queries.findLiveImpersonation(expired, testDb!)).toBeNull();

      const ended = await open(admin, subject);
      await queries.endImpersonationSession(
        { id: ended.id, reason: "exited" },
        testDb!,
      );
      expect(await queries.findLiveImpersonation(ended, testDb!)).toBeNull();
    });

    it("stops when the admin is no longer a global admin", async () => {
      const demoted = await createUser({ role: "admin" });
      const view = await open(demoted, subject);
      await testDb!
        .update(users)
        .set({ role: "festival_admin" })
        .where(eq(users.id, demoted.id));
      expect(await queries.findLiveImpersonation(view, testDb!)).toBeNull();
    });

    it("stops when the participant becomes staff mid-view", async () => {
      const promoted = await createUser();
      const view = await open(admin, promoted);
      await testDb!
        .update(users)
        .set({ role: "festival_admin" })
        .where(eq(users.id, promoted.id));
      expect(await queries.findLiveImpersonation(view, testDb!)).toBeNull();
    });

    it("stops when a profile no longer matches the Clerk id it started with", async () => {
      const replaced = await createUser();
      const view = await open(admin, replaced);
      await testDb!
        .update(users)
        .set({ clerkId: `view-as-${randomUUID()}` })
        .where(eq(users.id, replaced.id));
      expect(await queries.findLiveImpersonation(view, testDb!)).toBeNull();
    });

    it("stops when the participant's profile is deleted", async () => {
      const deleted = await createUser();
      const view = await open(admin, deleted);
      await testDb!.delete(users).where(eq(users.id, deleted.id));
      expect(await queries.findLiveImpersonation(view, testDb!)).toBeNull();
      expect((await stateOf(view.id)).subjectUserId).toBeNull();
    });
  });

  describe("findOpenImpersonationSession", () => {
    it("finds a view that is on, or ran out without an exit", async () => {
      const live = await open(admin, subject);
      expect(
        (await queries.findOpenImpersonationSession(live.tokenHash, testDb!))
          ?.state,
      ).toBe("active");

      const expired = await open(admin, subject);
      await expire(expired.id);
      expect(
        (await queries.findOpenImpersonationSession(expired.tokenHash, testDb!))
          ?.state,
      ).toBe("expired");
    });

    it("finds nothing once a view was ended", async () => {
      const view = await open(admin, subject);
      await queries.endImpersonationSession(
        { id: view.id, reason: "exited" },
        testDb!,
      );
      expect(
        await queries.findOpenImpersonationSession(view.tokenHash, testDb!),
      ).toBeNull();
    });
  });

  describe("endImpersonationSession", () => {
    it("ends a live view once, with its reason", async () => {
      const view = await open(admin, subject);
      expect(
        await queries.endImpersonationSession(
          { id: view.id, reason: "signed_out" },
          testDb!,
        ),
      ).toBe(true);
      expect(
        await queries.endImpersonationSession(
          { id: view.id, reason: "exited" },
          testDb!,
        ),
      ).toBe(false);
      const row = await stateOf(view.id);
      expect(row.endReason).toBe("signed_out");
      expect(row.endedAt).not.toBeNull();
    });

    it("leaves a view that already ran out reading as expired", async () => {
      const view = await open(admin, subject);
      await expire(view.id);
      expect(
        await queries.endImpersonationSession(
          { id: view.id, reason: "exited" },
          testDb!,
        ),
      ).toBe(false);
      const row = await stateOf(view.id);
      expect(row.endedAt).toBeNull();
      expect(row.endReason).toBeNull();
    });
  });

  describe("recordBlockedImpersonationWrite", () => {
    it("counts each refused write", async () => {
      const view = await open(admin, subject);
      await queries.recordBlockedImpersonationWrite(view.id, testDb!);
      await queries.recordBlockedImpersonationWrite(view.id, testDb!);
      expect((await stateOf(view.id)).blockedWrites).toBe(2);
    });
  });

  describe("listRecentImpersonations", () => {
    it("lists one admin's views newest first, with state and duration", async () => {
      const viewer = await createUser({ role: "admin" });
      const first = await createUser({ displayName: "Primera" });
      const second = await createUser({ displayName: "Segunda" });
      const third = await createUser({ displayName: "Tercera" });

      const expired = await open(viewer, first);
      await expire(expired.id);
      const exited = await open(viewer, second);
      await queries.endImpersonationSession(
        { id: exited.id, reason: "exited" },
        testDb!,
      );
      const live = await open(viewer, third);
      await queries.recordBlockedImpersonationWrite(live.id, testDb!);

      const recent = await queries.listRecentImpersonations(
        { adminUserId: viewer.id },
        10,
        testDb!,
      );
      expect(recent.map((row) => row.id)).toEqual([
        live.id,
        exited.id,
        expired.id,
      ]);
      expect(recent.map((row) => row.state)).toEqual([
        "active",
        "exited",
        "expired",
      ]);
      expect(recent.map((row) => row.subject?.displayName)).toEqual([
        "Tercera",
        "Segunda",
        "Primera",
      ]);
      // An expired view counts its whole hour, not the time since.
      expect(recent[2]!.durationSeconds).toBe(3600);
      expect(recent[0]!.durationSeconds).toBeLessThan(60);
      expect(recent[0]!.blockedWrites).toBe(1);
      expect(recent[0]!.admin?.id).toBe(viewer.id);
    });

    it("lists the views of one person's account across admins", async () => {
      const person = await createUser();
      const a = await open(admin, person);
      const b = await open(otherAdmin, person);
      const recent = await queries.listRecentImpersonations(
        { subjectUserId: person.id },
        10,
        testDb!,
      );
      expect(recent.map((row) => row.id)).toEqual([b.id, a.id]);
      expect(recent.map((row) => row.admin?.id)).toEqual([
        otherAdmin.id,
        admin.id,
      ]);
    });

    it("keeps a view of a deleted account, with nobody named", async () => {
      const viewer = await createUser({ role: "admin" });
      const gone = await createUser();
      const view = await open(viewer, gone);
      await testDb!.delete(users).where(eq(users.id, gone.id));
      const [row] = await queries.listRecentImpersonations(
        { adminUserId: viewer.id },
        10,
        testDb!,
      );
      expect(row?.id).toBe(view.id);
      expect(row?.subject).toBeNull();
    });

    it("caps the limit", async () => {
      const viewer = await createUser({ role: "admin" });
      for (let index = 0; index < 3; index += 1) {
        await open(viewer, subject);
      }
      expect(
        await queries.listRecentImpersonations(
          { adminUserId: viewer.id },
          2,
          testDb!,
        ),
      ).toHaveLength(2);
      expect(
        await queries.listRecentImpersonations(
          { adminUserId: viewer.id },
          0,
          testDb!,
        ),
      ).toHaveLength(1);
    });
  });

  describe("loadImpersonationTarget", () => {
    it("loads the profile, or nothing for an unknown id", async () => {
      const loaded = await queries.loadImpersonationTarget(subject.id, testDb!);
      expect(loaded.subject?.id).toBe(subject.id);
      expect(loaded.pendingDeletion).toBe(false);

      expect(
        await queries.loadImpersonationTarget(2_000_000_000, testDb!),
      ).toEqual({ subject: null, pendingDeletion: false });
    });

    it("says when the account is being deleted", async () => {
      const leaving = await createUser();
      await testDb!.insert(pendingUserDeletions).values({
        userId: leaving.id,
        clerkId: leaving.clerkId,
      });
      expect(
        (await queries.loadImpersonationTarget(leaving.id, testDb!))
          .pendingDeletion,
      ).toBe(true);
    });
  });
});
