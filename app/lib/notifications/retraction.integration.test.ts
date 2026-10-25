// @vitest-environment node

import { randomUUID } from "crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import * as schema from "@/db/schema";
import { notifications, users } from "@/db/schema";

/**
 * A retracted inbox item stays retracted (V3 of the phase 3 design): it is
 * archived, the database refuses to un-archive it, and every inbox write a
 * stale client can still send updates nothing on it. The retraction itself is
 * written in SQL here, as `retractComunicado` will write it.
 */

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: null })),
  currentUser: vi.fn(async () => null),
}));
// The actions resolve the viewer from Clerk and the inbox flag; tests set it.
const viewer = vi.hoisted(() => ({
  current: null as { id: number; role: "user" } | null,
}));
vi.mock("@/app/lib/notifications/queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/lib/notifications/queries")>()),
  resolveInboxViewer: async () => viewer.current,
  resolveInboxViewerWithAccess: async () => viewer.current,
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
  ? new Pool({ connectionString: testDatabaseUrl, max: 4 })
  : null;
const integrationDb = pool ? drizzle(pool, { schema }) : null;
const describeDatabase = integrationDb ? describe : describe.skip;

type Actions = typeof import("@/app/lib/notifications/actions");
type ReadModule = typeof import("@/app/lib/notifications/read");
let actions: Actions;
let read: ReadModule;

const createdUserIds: number[] = [];

async function createUser() {
  const suffix = randomUUID();
  const [user] = await integrationDb!
    .insert(users)
    .values({
      clerkId: `retraction-${suffix}`,
      email: `retraction-${suffix}@example.com`,
      displayName: "Ana Ilustra",
      role: "user",
      status: "verified",
    })
    .returning({ id: users.id });
  createdUserIds.push(user!.id);
  return { id: user!.id, role: "user" as const };
}

async function createItem(userId: number, { read }: { read: boolean }) {
  const [row] = await integrationDb!
    .insert(notifications)
    .values({
      userId,
      kind: "comunicado",
      category: "announcements",
      title: "Cambio de horario",
      body: "El festival abre a las 10:00.",
      dedupeKey: `comunicado:${randomUUID()}`,
      readAt: read ? sql`now() - interval '1 hour'` : null,
    })
    .returning({ id: notifications.id });
  return row!.id;
}

/** What F3 step 3 writes: archived (kept if it already was) and retracted. */
async function retract(id: number) {
  await pool!.query(
    `UPDATE notifications
        SET archived_at = coalesce(archived_at, now()), retracted_at = now()
      WHERE id = $1`,
    [id],
  );
}

async function stateOf(id: number) {
  const [row] = await integrationDb!
    .select({
      readAt: notifications.readAt,
      archivedAt: notifications.archivedAt,
      retractedAt: notifications.retractedAt,
      celebratedAt: notifications.celebratedAt,
    })
    .from(notifications)
    .where(eq(notifications.id, id));
  return row!;
}

describeDatabase("retracted inbox items", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl!;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";
    actions = await import("@/app/lib/notifications/actions");
    read = await import("@/app/lib/notifications/read");

    try {
      await integrationDb!
        .select({ retractedAt: notifications.retractedAt })
        .from(notifications)
        .limit(1);
    } catch (error) {
      throw new Error(
        "TEST_DATABASE_URL is safe but unmigrated; apply Drizzle migrations first.",
        { cause: error },
      );
    }
  }, 60_000);

  beforeEach(async () => {
    viewer.current = await createUser();
  });

  afterEach(async () => {
    viewer.current = null;
    if (createdUserIds.length > 0) {
      await integrationDb!
        .delete(notifications)
        .where(inArray(notifications.userId, createdUserIds));
      await integrationDb!
        .delete(users)
        .where(inArray(users.id, createdUserIds));
      createdUserIds.length = 0;
    }
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("refuses to un-archive a retracted row", async () => {
    const id = await createItem(viewer.current!.id, { read: false });
    await retract(id);

    await expect(
      pool!.query(`UPDATE notifications SET archived_at = NULL WHERE id = $1`, [
        id,
      ]),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "notifications_retracted_is_archived",
    });
    // So is a retraction that leaves the item in the inbox.
    const other = await createItem(viewer.current!.id, { read: false });
    await expect(
      pool!.query(
        `UPDATE notifications SET retracted_at = now() WHERE id = $1`,
        [other],
      ),
    ).rejects.toMatchObject({
      constraint: "notifications_retracted_is_archived",
    });
  });

  it("leaves a retracted row as it was when the archive toast's Deshacer, archive or unread arrive late", async () => {
    const id = await createItem(viewer.current!.id, { read: true });
    await retract(id);
    const before = await stateOf(id);
    expect(before.archivedAt).not.toBeNull();
    expect(before.retractedAt).not.toBeNull();
    expect(before.readAt).not.toBeNull();

    await expect(actions.unarchiveNotificationAction(id)).resolves.toEqual({
      success: true,
    });
    await expect(actions.archiveNotificationAction(id)).resolves.toEqual({
      success: true,
    });
    await expect(actions.markNotificationUnreadAction(id)).resolves.toEqual({
      success: true,
    });
    // The "Deshacer" after "Marcar todo como leído".
    await expect(actions.markNotificationsUnreadAction([id])).resolves.toEqual({
      success: true,
    });

    expect(await stateOf(id)).toEqual(before);
  });

  it("does not read a retracted row that was never read", async () => {
    const id = await createItem(viewer.current!.id, { read: false });
    await retract(id);
    const before = await stateOf(id);

    await expect(actions.markNotificationReadAction(id)).resolves.toEqual({
      success: true,
    });
    await read.markNotificationRead(viewer.current!, id);
    const markAll = await actions.markAllNotificationsReadAction("all");
    expect(markAll).toEqual({ success: true, ids: [] });

    expect(await stateOf(id)).toEqual(before);
    expect(before.readAt).toBeNull();
  });

  it("still reads, archives and restores an item that was not retracted", async () => {
    const id = await createItem(viewer.current!.id, { read: false });
    const retracted = await createItem(viewer.current!.id, { read: true });
    await retract(retracted);
    const retractedBefore = await stateOf(retracted);

    await read.markNotificationRead(viewer.current!, id);
    expect((await stateOf(id)).readAt).not.toBeNull();
    await actions.markNotificationUnreadAction(id);
    expect((await stateOf(id)).readAt).toBeNull();
    await actions.markNotificationReadAction(id);
    expect((await stateOf(id)).readAt).not.toBeNull();
    await actions.markNotificationUnreadAction(id);

    const markAll = await actions.markAllNotificationsReadAction("all");
    expect(markAll).toEqual({ success: true, ids: [id] });
    expect((await stateOf(id)).readAt).not.toBeNull();
    // A client that read the list before the retraction sends both ids
    // back: only the live one becomes unread.
    await actions.markNotificationsUnreadAction([id, retracted]);
    expect((await stateOf(id)).readAt).toBeNull();
    expect(await stateOf(retracted)).toEqual(retractedBefore);

    await actions.archiveNotificationAction(id);
    expect((await stateOf(id)).archivedAt).not.toBeNull();
    await actions.unarchiveNotificationAction(id);
    expect(await stateOf(id)).toMatchObject({
      archivedAt: null,
      retractedAt: null,
    });
  });
});
