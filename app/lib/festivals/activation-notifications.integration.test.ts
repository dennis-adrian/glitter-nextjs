// @vitest-environment node

import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import * as schema from "@/db/schema";
import {
  festivals,
  festivalSectors,
  notificationDeliveries,
  notifications,
  profileSubcategories,
  pushSubscriptions,
  stands,
  subcategories,
  users,
} from "@/db/schema";

const { requireAdminOrFestivalAdmin, after } = vi.hoisted(() => ({
  requireAdminOrFestivalAdmin: vi.fn(),
  after: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after,
}));
vi.mock("@/app/lib/users/helpers", () => ({
  requireAdminOrFestivalAdmin,
}));

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

function isSafeTestDatabase(url: string): boolean {
  try {
    const databaseName = decodeURIComponent(new URL(url).pathname.slice(1));
    return /(^|[_-])(test|ci)([_-]|$)/i.test(databaseName);
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
  ? new Pool({ connectionString: testDatabaseUrl })
  : null;
const integrationDb = pool ? drizzle(pool, { schema }) : null;
const describeDatabase = integrationDb ? describe : describe.skip;

let actions: typeof import("@/app/lib/festivals/activation-notifications");

const KIND = "festival_participant_invitation";
const ADMIN = { id: 1, role: "admin" };

const created = {
  festivals: [] as number[],
  users: [] as number[],
  subcategories: [] as number[],
};

function tag() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

describeDatabase("activation notifications", () => {
  let subcategoryId: number;

  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";

    actions = await import("@/app/lib/festivals/activation-notifications");

    const result = await pool!.query<{ festivals: string | null }>(
      "select to_regclass('public.festivals')::text as festivals",
    );
    if (!result.rows[0]?.festivals) {
      throw new Error(
        "TEST_DATABASE_URL is safe but unmigrated; apply Drizzle migrations first.",
      );
    }

    const [subcategory] = await integrationDb!
      .insert(subcategories)
      .values({ label: `Activation ${tag()}`, category: "illustration" })
      .returning();
    subcategoryId = subcategory!.id;
    created.subcategories.push(subcategoryId);
  }, 60_000);

  afterEach(async () => {
    requireAdminOrFestivalAdmin.mockReset();
    after.mockReset();
    const db = integrationDb!;
    const userIds = created.users.splice(0);
    if (userIds.length > 0) {
      // Their inbox items, deliveries and devices go with them.
      await db.delete(users).where(inArray(users.id, userIds));
    }
    const festivalIds = created.festivals.splice(0);
    if (festivalIds.length > 0) {
      await db.delete(stands).where(inArray(stands.festivalId, festivalIds));
      await db
        .delete(festivalSectors)
        .where(inArray(festivalSectors.festivalId, festivalIds));
      await db.delete(festivals).where(inArray(festivals.id, festivalIds));
    }
  });

  afterAll(async () => {
    const ids = created.subcategories.splice(0);
    if (ids.length > 0) {
      await integrationDb!
        .delete(subcategories)
        .where(inArray(subcategories.id, ids));
    }
    await pool?.end();
  });

  async function makeFestival(
    values: Partial<typeof festivals.$inferInsert> = {},
    categories: (typeof stands.$inferInsert)["standCategory"][] = [
      "illustration",
    ],
  ) {
    const db = integrationDb!;
    const [festival] = await db
      .insert(festivals)
      .values({
        name: `Activation ${tag()}`,
        status: "active",
        festivalType: "glitter",
        reservationsStartDate: new Date("2099-11-20T14:00:00Z"),
        ...values,
      })
      .returning();
    created.festivals.push(festival!.id);
    const [sector] = await db
      .insert(festivalSectors)
      .values({ name: "Galería", festivalId: festival!.id })
      .returning();
    if (categories.length > 0) {
      await db.insert(stands).values(
        categories.map((standCategory, index) => ({
          standNumber: index + 1,
          standCategory,
          festivalId: festival!.id,
          festivalSectorId: sector!.id,
        })),
      );
    }
    return festival!;
  }

  async function makeUser(
    values: Partial<typeof users.$inferInsert> = {},
    {
      withSubcategory = true,
      devices = 0,
    }: { withSubcategory?: boolean; devices?: number } = {},
  ) {
    const db = integrationDb!;
    const t = tag();
    const [user] = await db
      .insert(users)
      .values({
        clerkId: `clerk-activation-${t}`,
        email: `activation-${t}@example.test`,
        status: "verified",
        category: "illustration",
        ...values,
      })
      .returning();
    created.users.push(user!.id);
    if (withSubcategory) {
      await db
        .insert(profileSubcategories)
        .values({ profileId: user!.id, subcategoryId });
    }
    for (let i = 0; i < devices; i++) {
      await db.insert(pushSubscriptions).values({
        userId: user!.id,
        endpoint: `https://push.example.test/${t}/${i}`,
        p256dh: "p256dh",
        auth: "auth",
        applicationServerKey: "key",
      });
    }
    return user!;
  }

  async function itemsFor(festivalId: number, userIds: number[]) {
    return integrationDb!
      .select({
        id: notifications.id,
        userId: notifications.userId,
        title: notifications.title,
        actionPath: notifications.actionPath,
      })
      .from(notifications)
      .where(
        and(
          eq(notifications.kind, KIND),
          eq(
            notifications.dedupeKey,
            `festival-participant-invitation:${festivalId}`,
          ),
          inArray(notifications.userId, userIds),
        ),
      );
  }

  async function deliveriesFor(notificationIds: number[]) {
    if (notificationIds.length === 0) return [];
    return integrationDb!
      .select({
        channel: notificationDeliveries.channel,
        lane: notificationDeliveries.lane,
      })
      .from(notificationDeliveries)
      .where(inArray(notificationDeliveries.notificationId, notificationIds));
  }

  it("refuses callers who are not staff, and writes nothing", async () => {
    const festival = await makeFestival();
    const user = await makeUser();
    requireAdminOrFestivalAdmin.mockResolvedValue(null);

    expect(
      await actions.sendActivationNotifications({
        festivalId: festival.id,
        push: true,
      }),
    ).toEqual({ success: false, message: "No autorizado" });
    expect(
      await actions.fetchActivationNotificationAudience(festival.id),
    ).toEqual({ success: false, message: "No autorizado" });
    expect(
      await actions.previewActivationNotification(festival.id),
    ).toEqual({ success: false, message: "No autorizado" });
    expect(await itemsFor(festival.id, [user.id])).toHaveLength(0);
  });

  it("refuses a festival that is not active", async () => {
    const festival = await makeFestival({ status: "published" });
    const user = await makeUser();
    requireAdminOrFestivalAdmin.mockResolvedValue(ADMIN);

    expect(
      await actions.sendActivationNotifications({
        festivalId: festival.id,
        push: false,
      }),
    ).toEqual({
      success: false,
      message: "Activa el festival antes de enviar notificaciones.",
    });
    expect(await itemsFor(festival.id, [user.id])).toHaveLength(0);
  });

  it("counts and reaches the activation email's participants", async () => {
    const festival = await makeFestival({}, ["illustration", "gastronomy"]);
    const illustrator = await makeUser({}, { devices: 2 });
    const cook = await makeUser({ category: "gastronomy" });
    const outside = await makeUser({ category: "entrepreneurship" });
    const pending = await makeUser({ status: "pending" });
    const noSubcategory = await makeUser({}, { withSubcategory: false });
    requireAdminOrFestivalAdmin.mockResolvedValue(ADMIN);
    const everyone = [
      illustrator.id,
      cook.id,
      outside.id,
      pending.id,
      noSubcategory.id,
    ];

    const counted = await actions.fetchActivationNotificationAudience(
      festival.id,
    );
    expect(counted.success).toBe(true);
    if (!counted.success) return;
    // Other suites' participants share the database: count ours from below.
    expect(counted.audience.recipients).toBeGreaterThanOrEqual(2);
    expect(counted.audience.withPush).toBeGreaterThanOrEqual(1);

    const sent = await actions.sendActivationNotifications({
      festivalId: festival.id,
      push: true,
    });
    expect(sent).toMatchObject({ success: true });

    const items = await itemsFor(festival.id, everyone);
    expect(items.map((item) => item.userId).sort((a, b) => a - b)).toEqual(
      [illustrator.id, cook.id].sort((a, b) => a - b),
    );
    expect(items[0]).toMatchObject({
      title: `Te invitamos a participar en ${festival.name}`,
      actionPath: `/festivals/${festival.id}/terms`,
    });
    expect(after).toHaveBeenCalledTimes(1);
  });

  it("queues one bulk push per device only when asked, and never an email", async () => {
    const festival = await makeFestival();
    const withDevices = await makeUser({}, { devices: 2 });
    requireAdminOrFestivalAdmin.mockResolvedValue(ADMIN);

    await actions.sendActivationNotifications({
      festivalId: festival.id,
      push: true,
    });

    const [item] = await itemsFor(festival.id, [withDevices.id]);
    expect(await deliveriesFor([item!.id])).toEqual([
      { channel: "push", lane: "bulk" },
      { channel: "push", lane: "bulk" },
    ]);
  });

  it("writes only the inbox item without push", async () => {
    const festival = await makeFestival();
    const withDevices = await makeUser({}, { devices: 1 });
    requireAdminOrFestivalAdmin.mockResolvedValue(ADMIN);

    const sent = await actions.sendActivationNotifications({
      festivalId: festival.id,
      push: false,
    });

    const items = await itemsFor(festival.id, [withDevices.id]);
    expect(items).toHaveLength(1);
    expect(await deliveriesFor(items.map((item) => item.id))).toEqual([]);
    expect(sent).toMatchObject({ success: true, pushes: 0 });
    expect(after).not.toHaveBeenCalled();
  });

  it("never notifies anyone twice for one festival", async () => {
    const festival = await makeFestival();
    const user = await makeUser({}, { devices: 1 });
    requireAdminOrFestivalAdmin.mockResolvedValue(ADMIN);

    await actions.sendActivationNotifications({
      festivalId: festival.id,
      push: true,
    });
    const again = await actions.sendActivationNotifications({
      festivalId: festival.id,
      push: true,
    });

    const items = await itemsFor(festival.id, [user.id]);
    expect(items).toHaveLength(1);
    expect(await deliveriesFor(items.map((item) => item.id))).toHaveLength(1);
    expect(again).toMatchObject({ success: true });
    if (again.success) {
      expect(again.alreadyNotified).toBeGreaterThanOrEqual(1);
    }
  });

  it("previews the item and the push from the festival as it is", async () => {
    const festival = await makeFestival({
      reservationsStartDate: new Date("2099-11-20T14:00:00Z"),
    });
    requireAdminOrFestivalAdmin.mockResolvedValue(ADMIN);

    const preview = await actions.previewActivationNotification(festival.id);

    expect(preview).toEqual({
      success: true,
      item: {
        title: `Te invitamos a participar en ${festival.name}`,
        body: "Las reservas se habilitarán el 20 de noviembre de 2099 a las 10:00 AM. Hasta mientras, leé con atención los términos y condiciones.",
        actionPath: `/festivals/${festival.id}/terms`,
        actionLabel: "Leer términos y condiciones",
      },
      push: {
        title: `Te invitamos a participar en ${festival.name}`,
        body: "Las reservas se habilitarán el 20 de noviembre de 2099 a las 10:00 AM. Hasta mientras, leé con atención los términos y condiciones.",
      },
    });
  });
});
