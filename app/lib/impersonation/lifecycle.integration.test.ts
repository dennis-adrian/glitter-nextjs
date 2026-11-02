// @vitest-environment node

import { randomUUID } from "crypto";
import { eq, inArray, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";
import { impersonationSessions, pendingUserDeletions, users } from "@/db/schema";

/**
 * "Entrar como participante" from start to Salir against a real database
 * (docs/PLAN-impersonation.md §5): the real start action, viewer, guard and
 * exit, with only Clerk and the request's cookie store stood in for. Each
 * `request()` is a fresh cookie store, as Next gives every request one.
 */

vi.mock("server-only", () => ({}));

const { clerk, jar, posthog } = vi.hoisted(() => ({
  clerk: { userId: null as string | null, sessionId: null as string | null },
  jar: new Map<string, string>(),
  posthog: { capture: vi.fn(), shutdown: vi.fn(async () => {}) },
}));

/** The browser's cookies; every request gets its own store over them. */
let store = makeStore();
function makeStore() {
  return {
    get: (name: string) =>
      jar.has(name) ? { name, value: jar.get(name)! } : undefined,
    has: (name: string) => jar.has(name),
    set: (name: string, value: string, options?: { maxAge?: number }) => {
      if (options?.maxAge === 0 || value === "") jar.delete(name);
      else jar.set(name, value);
    },
  };
}
function request() {
  store = makeStore();
}

vi.mock("next/headers", () => ({ cookies: async () => store }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: clerk.userId, sessionId: clerk.sessionId }),
}));
vi.mock("@/app/lib/posthog-server", () => ({
  getPostHogClient: () => posthog,
  POSTHOG_SHUTDOWN_TIMEOUT_MS: 1,
}));

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
  ? new Pool({ connectionString: testDatabaseUrl, max: 2 })
  : null;
const testDb = pool ? drizzle(pool, { schema }) : null;
const describeDatabase = testDb ? describe : describe.skip;

type Actions = typeof import("@/app/lib/impersonation/actions");
type Exit = typeof import("@/app/lib/impersonation/exit");
type Viewer = typeof import("@/app/lib/impersonation/viewer");
type Helpers = typeof import("@/app/lib/users/helpers");
type AppDb = (typeof import("@/db"))["db"];
let actions: Actions;
let exit: Exit;
let viewer: Viewer;
let helpers: Helpers;
let appDb: AppDb;

const createdUsers: number[] = [];

async function createUser(values: Partial<typeof users.$inferInsert> = {}) {
  const suffix = randomUUID();
  const [user] = await testDb!
    .insert(users)
    .values({
      clerkId: `life-${suffix}`,
      email: `life-${suffix}@example.com`,
      displayName: `Vida ${suffix.slice(0, 6)}`,
      role: "user",
      status: "verified",
      ...values,
    })
    .returning();
  createdUsers.push(user!.id);
  return user!;
}

function signIn(clerkId: string, sessionId = `sess_${randomUUID()}`) {
  clerk.userId = clerkId;
  clerk.sessionId = sessionId;
  return sessionId;
}

async function sessionsOf(adminId: number) {
  return testDb!
    .select()
    .from(impersonationSessions)
    .where(eq(impersonationSessions.adminUserId, adminId));
}

describeDatabase("a view from start to Salir", () => {
  let admin: typeof users.$inferSelect;
  let participant: typeof users.$inferSelect;

  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl!;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";
    actions = await import("@/app/lib/impersonation/actions");
    exit = await import("@/app/lib/impersonation/exit");
    viewer = await import("@/app/lib/impersonation/viewer");
    helpers = await import("@/app/lib/users/helpers");
    appDb = (await import("@/db")).db;
    admin = await createUser({ role: "admin", displayName: "Admin vida" });
    participant = await createUser({ displayName: "Participante vida" });
  });

  beforeEach(() => {
    jar.clear();
    request();
    clerk.userId = null;
    clerk.sessionId = null;
    posthog.capture.mockClear();
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
      await testDb
        .delete(pendingUserDeletions)
        .where(inArray(pendingUserDeletions.userId, createdUsers));
      await testDb.delete(users).where(inArray(users.id, createdUsers));
    }
    await pool?.end();
    const { pool: appPool } = await import("@/db");
    await appPool.end();
  });

  it("enters, sees the app as the participant read-only, and leaves", async () => {
    const sessionId = signIn(admin.clerkId);

    const started = await actions.startImpersonationAction({
      subjectId: participant.id,
      returnTo: `/dashboard/users/${participant.id}`,
    });
    expect(started).toEqual({ success: true, redirectTo: "/portal" });
    expect(posthog.capture).toHaveBeenCalledWith(
      expect.objectContaining({
        distinctId: admin.clerkId,
        event: "impersonation_started",
      }),
    );
    const [row] = await sessionsOf(admin.id);
    expect(row).toMatchObject({
      subjectUserId: participant.id,
      adminClerkSessionId: sessionId,
      returnTo: `/dashboard/users/${participant.id}`,
      endedAt: null,
    });

    // The next request carries the cookie: every lookup is the participant.
    request();
    expect((await helpers.getCurrentUserProfile())?.id).toBe(participant.id);
    expect(await helpers.requireAdmin()).toBeNull();
    expect(await viewer.isImpersonating()).toBe(true);

    // Nothing is written as them; the refusal is counted on the view.
    await expect(
      appDb
        .update(users)
        .set({ bio: "escrito por el admin" })
        .where(eq(users.id, participant.id)),
    ).rejects.toMatchObject({ cause: { code: "IMPERSONATION_READ_ONLY" } });
    await vi.waitFor(async () => {
      expect((await sessionsOf(admin.id))[0]?.blockedWrites).toBe(1);
    });
    const [untouched] = await testDb!
      .select({ bio: users.bio })
      .from(users)
      .where(eq(users.id, participant.id));
    expect(untouched?.bio).toBeNull();

    // Salir, from any page, back to where the view started.
    request();
    await expect(exit.exitImpersonation(store, "exited")).resolves.toEqual({
      returnTo: `/dashboard/users/${participant.id}`,
      ended: true,
    });
    expect(jar.size).toBe(0);
    expect((await sessionsOf(admin.id))[0]).toMatchObject({
      endReason: "exited",
    });

    // And the admin is themself again.
    request();
    expect((await helpers.getCurrentUserProfile())?.id).toBe(admin.id);
    expect(await viewer.isImpersonating()).toBe(false);
  });

  it("refuses to start from inside a view", async () => {
    signIn(admin.clerkId);
    await actions.startImpersonationAction({ subjectId: participant.id });
    request();
    const other = await createUser();
    await expect(
      actions.startImpersonationAction({ subjectId: other.id }),
    ).resolves.toEqual({
      success: false,
      message: "Ya estás viendo la app como otra cuenta. Salí primero.",
    });
  });

  it.each([
    ["a festival admin", "festival_admin"],
    ["a participant", "user"],
  ] as const)("refuses %s, and writes nothing", async (_, role) => {
    const actor = await createUser({ role });
    signIn(actor.clerkId);
    await expect(
      actions.startImpersonationAction({ subjectId: participant.id }),
    ).resolves.toEqual({
      success: false,
      message: "No tenés permiso para entrar como otra cuenta.",
    });
    expect(await sessionsOf(actor.id)).toHaveLength(0);
    expect(jar.size).toBe(0);
  });

  it("refuses a signed-out request", async () => {
    await expect(
      actions.startImpersonationAction({ subjectId: participant.id }),
    ).resolves.toMatchObject({ success: false });
    expect(jar.size).toBe(0);
  });

  it.each([
    ["a staff account", { role: "festival_admin" as const }, "No se puede entrar como una cuenta de administración."],
    ["another global admin", { role: "admin" as const }, "No se puede entrar como una cuenta de administración."],
  ])("refuses to view %s", async (_, values, message) => {
    const staff = await createUser(values);
    signIn(admin.clerkId);
    await expect(
      actions.startImpersonationAction({ subjectId: staff.id }),
    ).resolves.toEqual({ success: false, message });
  });

  it("refuses an account being deleted", async () => {
    const leaving = await createUser();
    await testDb!
      .insert(pendingUserDeletions)
      .values({ userId: leaving.id, clerkId: leaving.clerkId });
    signIn(admin.clerkId);
    await expect(
      actions.startImpersonationAction({ subjectId: leaving.id }),
    ).resolves.toEqual({
      success: false,
      message: "Esta cuenta se está eliminando.",
    });
  });

  it("keeps a return path only when it is an admin page", async () => {
    signIn(admin.clerkId);
    const person = await createUser();
    await actions.startImpersonationAction({
      subjectId: person.id,
      returnTo: "https://evil.example/",
    });
    const [row] = (await sessionsOf(admin.id)).filter(
      (s) => s.subjectUserId === person.id,
    );
    expect(row?.returnTo).toBeNull();
    request();
    await expect(exit.exitImpersonation(store, "exited")).resolves.toEqual({
      returnTo: "/dashboard",
      ended: true,
    });
  });

  it("never ends another Clerk session's view, and still clears the cookie", async () => {
    signIn(admin.clerkId, "sess_first");
    const person = await createUser();
    await actions.startImpersonationAction({ subjectId: person.id });
    // Same cookie, a new sign-in: the old view opens nothing here.
    request();
    signIn(admin.clerkId, "sess_second");
    expect((await helpers.getCurrentUserProfile())?.id).toBe(admin.id);
    await expect(exit.exitImpersonation(store, "exited")).resolves.toEqual({
      returnTo: "/dashboard",
      ended: false,
    });
    expect(jar.size).toBe(0);
    const [row] = (await sessionsOf(admin.id)).filter(
      (s) => s.subjectUserId === person.id,
    );
    expect(row?.endedAt).toBeNull();
  });

  it("records a sign-out from inside a view", async () => {
    signIn(admin.clerkId);
    const person = await createUser();
    await actions.startImpersonationAction({ subjectId: person.id });
    request();
    await exit.exitImpersonation(store, "signed_out");
    const [row] = (await sessionsOf(admin.id)).filter(
      (s) => s.subjectUserId === person.id,
    );
    expect(row?.endReason).toBe("signed_out");
  });

  it("leaves a view that ran out reading as expired, and lets the admin out", async () => {
    signIn(admin.clerkId);
    const person = await createUser();
    await actions.startImpersonationAction({ subjectId: person.id });
    const [row] = (await sessionsOf(admin.id)).filter(
      (s) => s.subjectUserId === person.id,
    );
    await testDb!
      .update(impersonationSessions)
      .set({
        startedAt: sql`now() - interval '61 minutes'`,
        expiresAt: sql`now() - interval '1 minute'`,
      })
      .where(eq(impersonationSessions.id, row!.id));
    request();
    // The cookie opens nothing any more: the admin is themself.
    expect((await helpers.getCurrentUserProfile())?.id).toBe(admin.id);
    await expect(exit.exitImpersonation(store, "exited")).resolves.toMatchObject({
      ended: false,
    });
    expect(jar.size).toBe(0);
    const [after] = (await sessionsOf(admin.id)).filter(
      (s) => s.id === row!.id,
    );
    expect(after?.endedAt).toBeNull();
  });

  it("lets a signed-out browser drop a stale cookie", async () => {
    jar.set("glitter_view_as", "a".repeat(43));
    await expect(exit.exitImpersonation(store, "exited")).resolves.toEqual({
      returnTo: "/",
      ended: false,
    });
    expect(jar.size).toBe(0);
  });
});
