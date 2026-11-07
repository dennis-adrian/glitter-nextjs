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
  emailUnsubscribes,
  festivalReservationsOpenNotices,
  festivals,
  festivalSectors,
  notificationCampaigns,
  notificationDeliveries,
  notifications,
  profileSubcategories,
  pushSubscriptions,
  reservationParticipants,
  standReservations,
  stands,
  subcategories,
  users,
} from "@/db/schema";

const { requireAdminOrFestivalAdmin, after, revalidatePath } = vi.hoisted(
  () => ({
    requireAdminOrFestivalAdmin: vi.fn(),
    after: vi.fn(),
    revalidatePath: vi.fn(),
  }),
);

vi.mock("server-only", () => ({}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after,
}));
vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/cache")>()),
  revalidatePath,
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

let service: typeof import("@/app/lib/festivals/reservations-open-notices");
let actions: typeof import("@/app/lib/festivals/reservations-open-actions");

const KIND = "festival_reservations_open";
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const ALL = { email: true, inApp: true, push: true };

const created = {
  festivals: [] as number[],
  users: [] as number[],
  subcategories: [] as number[],
  emails: [] as string[],
};

function tag() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

describeDatabase("reservations-open notices", () => {
  let subcategoryId: number;
  let admin: typeof users.$inferSelect;

  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";

    service = await import("@/app/lib/festivals/reservations-open-notices");
    actions = await import("@/app/lib/festivals/reservations-open-actions");

    const result = await pool!.query<{ notices: string | null }>(
      "select to_regclass('public.festival_reservations_open_notices')::text as notices",
    );
    if (!result.rows[0]?.notices) {
      throw new Error(
        "TEST_DATABASE_URL is safe but unmigrated; apply Drizzle migrations first.",
      );
    }

    const [subcategory] = await integrationDb!
      .insert(subcategories)
      .values({ label: `Reservations open ${tag()}`, category: "illustration" })
      .returning();
    subcategoryId = subcategory!.id;
    created.subcategories.push(subcategoryId);
  }, 60_000);

  afterEach(async () => {
    requireAdminOrFestivalAdmin.mockReset();
    after.mockReset();
    const db = integrationDb!;
    const festivalIds = created.festivals.splice(0);
    if (festivalIds.length > 0) {
      const notices = await db
        .select({ campaignId: festivalReservationsOpenNotices.campaignId })
        .from(festivalReservationsOpenNotices)
        .where(
          inArray(festivalReservationsOpenNotices.festivalId, festivalIds),
        );
      await db
        .delete(standReservations)
        .where(inArray(standReservations.festivalId, festivalIds));
      await db.delete(stands).where(inArray(stands.festivalId, festivalIds));
      await db
        .delete(festivalSectors)
        .where(inArray(festivalSectors.festivalId, festivalIds));
      await db.delete(festivals).where(inArray(festivals.id, festivalIds));
      if (notices.length > 0) {
        await db.delete(notificationCampaigns).where(
          inArray(
            notificationCampaigns.id,
            notices.map((row) => row.campaignId),
          ),
        );
      }
    }
    const userIds = created.users.splice(0);
    if (userIds.length > 0) {
      // Their inbox items, deliveries and devices go with them.
      await db.delete(users).where(inArray(users.id, userIds));
    }
    const emailKeys = created.emails.splice(0);
    if (emailKeys.length > 0) {
      await db
        .delete(emailUnsubscribes)
        .where(inArray(emailUnsubscribes.emailKey, emailKeys));
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
  ) {
    const db = integrationDb!;
    const [festival] = await db
      .insert(festivals)
      .values({
        name: `Reservations open ${tag()}`,
        status: "active",
        festivalType: "glitter",
        // Inside the automatic notice's one-hour window.
        reservationsStartDate: new Date(Date.now() - 10 * MINUTE),
        ...values,
      })
      .returning();
    created.festivals.push(festival!.id);
    const [sector] = await db
      .insert(festivalSectors)
      .values({ name: "Galería", festivalId: festival!.id })
      .returning();
    const [stand] = await db
      .insert(stands)
      .values({
        standNumber: 1,
        standCategory: "illustration",
        festivalId: festival!.id,
        festivalSectorId: sector!.id,
      })
      .returning();
    return { festival: festival!, standId: stand!.id };
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
        clerkId: `clerk-reservations-open-${t}`,
        email: `reservations-open-${t}@example.test`,
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

  /**
   * Only this test's people: suites share the database and run in parallel,
   * and the notice reaches every eligible participant in it.
   */
  function mine() {
    return created.users.length > 0 ? created.users : [-1];
  }

  async function itemsFor(campaignId: number) {
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
          eq(notifications.campaignId, campaignId),
          inArray(notifications.userId, mine()),
        ),
      );
  }

  async function deliveriesFor(campaignId: number) {
    return integrationDb!
      .select({
        userId: notificationDeliveries.userId,
        channel: notificationDeliveries.channel,
        lane: notificationDeliveries.lane,
        status: notificationDeliveries.status,
        lastError: notificationDeliveries.lastError,
      })
      .from(notificationDeliveries)
      .innerJoin(
        notifications,
        eq(notifications.id, notificationDeliveries.notificationId),
      )
      .where(
        and(
          eq(notifications.campaignId, campaignId),
          inArray(notificationDeliveries.userId, mine()),
        ),
      );
  }

  it("reaches verified participants who can reserve and have no reservation yet", async () => {
    const { festival, standId } = await makeFestival();
    const reader = await makeUser({}, { devices: 2 });
    const quiet = await makeUser();
    const pending = await makeUser({ status: "pending" });
    const noSubcategory = await makeUser({}, { withSubcategory: false });
    const otherCategory = await makeUser({ category: "gastronomy" });
    const reserved = await makeUser();
    const [reservation] = await integrationDb!
      .insert(standReservations)
      .values({
        standId,
        festivalId: festival.id,
        status: "accepted",
        ownerUserId: reserved.id,
      })
      .returning();
    await integrationDb!
      .insert(reservationParticipants)
      .values({ userId: reserved.id, reservationId: reservation!.id });

    // At least this test's two; other suites' participants count too.
    const audience = await service.countReservationsOpenAudience(festival.id);
    expect(audience.recipients).toBeGreaterThanOrEqual(2);
    expect(audience.withPush).toBeGreaterThanOrEqual(1);

    const result = await service.createReservationsOpenNotice({
      festivalId: festival.id,
      trigger: "automatic",
      now: new Date(),
    });
    expect(result.kind).toBe("sent");
    if (result.kind !== "sent") return;
    expect(result.recipients).toBeGreaterThanOrEqual(2);

    const items = await itemsFor(result.campaignId);
    expect(items.map((item) => item.userId).sort()).toEqual(
      [reader.id, quiet.id].sort(),
    );
    expect(items[0]).toMatchObject({
      title: `¡Ya abrieron las reservas para ${festival.name}!`,
      actionPath: `/festivals/${festival.id}/terms`,
    });
    const deliveries = await deliveriesFor(result.campaignId);
    expect(
      deliveries.filter((d) => d.channel === "email").map((d) => d.userId),
    ).toHaveLength(2);
    expect(
      deliveries.filter((d) => d.channel === "push").map((d) => d.userId),
    ).toEqual([reader.id, reader.id]);
    expect(deliveries.every((d) => d.lane === "bulk")).toBe(true);
    for (const user of [pending, noSubcategory, otherCategory, reserved]) {
      expect(items.some((item) => item.userId === user.id)).toBe(false);
    }

    const [notice] = await integrationDb!
      .select()
      .from(festivalReservationsOpenNotices)
      .where(eq(festivalReservationsOpenNotices.campaignId, result.campaignId));
    expect(notice).toMatchObject({
      festivalId: festival.id,
      trigger: "automatic",
      env: "development",
      createdByUserId: null,
    });
    expect(notice!.reservationsStartDate.getTime()).toBe(
      festival.reservationsStartDate.getTime(),
    );
  });

  it("sends the automatic notice once per opening, and again when the date moves", async () => {
    const { festival } = await makeFestival();
    await makeUser();

    const first = await service.createReservationsOpenNotice({
      festivalId: festival.id,
      trigger: "automatic",
      now: new Date(),
    });
    expect(first.kind).toBe("sent");
    expect(
      await service.createReservationsOpenNotice({
        festivalId: festival.id,
        trigger: "automatic",
        now: new Date(),
      }),
    ).toEqual({ kind: "already_sent" });

    await integrationDb!
      .update(festivals)
      .set({ reservationsStartDate: new Date(Date.now() - HOUR / 2) })
      .where(eq(festivals.id, festival.id));
    expect(
      (
        await service.createReservationsOpenNotice({
          festivalId: festival.id,
          trigger: "automatic",
          now: new Date(),
        })
      ).kind,
    ).toBe("sent");
  });

  it("refuses festivals that are not active or not open yet", async () => {
    const { festival: draft } = await makeFestival({ status: "draft" });
    const { festival: upcoming } = await makeFestival({
      status: "draft",
      reservationsStartDate: new Date(Date.now() + HOUR),
    });
    await makeUser();

    expect(
      await service.createReservationsOpenNotice({
        festivalId: draft.id,
        trigger: "automatic",
        now: new Date(),
      }),
    ).toEqual({ kind: "inactive" });
    await integrationDb!
      .update(festivals)
      .set({ status: "archived" })
      .where(eq(festivals.id, draft.id));
    await integrationDb!
      .update(festivals)
      .set({ status: "active" })
      .where(eq(festivals.id, upcoming.id));
    expect(
      await service.createReservationsOpenNotice({
        festivalId: upcoming.id,
        trigger: "automatic",
        now: new Date(),
      }),
    ).toEqual({ kind: "not_open" });
  });

  it("finds only festivals with it on that opened within the hour and have no notice", async () => {
    const { festival: recent } = await makeFestival();
    const { festival: old } = await makeFestival({
      reservationsStartDate: new Date(Date.now() - 2 * HOUR),
    });
    const { festival: switchedOff } = await makeFestival({
      reservationsOpenNoticeAuto: false,
    });
    const { festival: future } = await makeFestival({
      status: "draft",
      reservationsStartDate: new Date(Date.now() + HOUR),
    });

    const due = (
      await service.findFestivalsDueForReservationsOpenNotice(new Date())
    ).map((row) => row.id);
    expect(due).toContain(recent.id);
    expect(due).not.toContain(old.id);
    expect(due).not.toContain(switchedOff.id);
    expect(due).not.toContain(future.id);

    await service.createReservationsOpenNotice({
      festivalId: recent.id,
      trigger: "automatic",
      now: new Date(),
    });
    expect(
      (await service.findFestivalsDueForReservationsOpenNotice(new Date())).map(
        (row) => row.id,
      ),
    ).not.toContain(recent.id);
  });

  it("delivers the email on the bulk lane, skipping those who unsubscribed", async () => {
    const { festival } = await makeFestival();
    const reader = await makeUser();
    const leaver = await makeUser();
    const key = leaver.email.toLowerCase();
    await integrationDb!
      .insert(emailUnsubscribes)
      .values({ emailKey: key, topic: "participant_invitations" });
    created.emails.push(key);

    const run = await service.sendDueReservationsOpenNotices({
      deadline: Date.now() + 60_000,
    });
    const sent = run.sent.find((row) => row.festivalId === festival.id);
    expect(sent).toBeDefined();

    const emails = (await deliveriesFor(sent!.campaignId)).filter(
      (d) => d.channel === "email",
    );
    expect(emails.find((d) => d.userId === reader.id)).toMatchObject({
      status: "sent",
    });
    expect(emails.find((d) => d.userId === leaver.id)).toMatchObject({
      status: "skipped",
      lastError: "opted_out",
    });
    // The inbox still has it: unsubscribing is from email only.
    expect(
      (await itemsFor(sent!.campaignId)).map((item) => item.userId).sort(),
    ).toEqual([reader.id, leaver.id].sort());
  }, 60_000);

  it("lets staff resend it to everyone again, once per click", async () => {
    const { festival } = await makeFestival();
    const user = await makeUser();
    admin = await makeUser({ role: "admin", displayName: "Ana Admin" });
    const first = await service.createReservationsOpenNotice({
      festivalId: festival.id,
      trigger: "automatic",
      now: new Date(),
    });
    expect(first.kind).toBe("sent");

    requireAdminOrFestivalAdmin.mockResolvedValue(null);
    expect(
      await actions.resendReservationsOpenNotice({
        festivalId: festival.id,
        requestId: crypto.randomUUID(),
        channels: ALL,
      }),
    ).toEqual({ success: false, message: "No autorizado" });

    requireAdminOrFestivalAdmin.mockResolvedValue(admin);
    const requestId = crypto.randomUUID();
    const resent = await actions.resendReservationsOpenNotice({
      festivalId: festival.id,
      requestId,
      channels: ALL,
    });
    expect(resent).toMatchObject({ success: true, alreadySent: false });
    expect(after).toHaveBeenCalledOnce();
    expect(
      await actions.resendReservationsOpenNotice({
        festivalId: festival.id,
        requestId,
        channels: ALL,
      }),
    ).toMatchObject({ success: true, alreadySent: true });

    const history = await service.fetchReservationsOpenNotices(festival.id);
    expect(history.map((row) => row.trigger)).toEqual(["manual", "automatic"]);
    expect(history[0]).toMatchObject({ sentByName: "Ana Admin" });
    const inbox = await integrationDb!
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(eq(notifications.userId, user.id), eq(notifications.kind, KIND)),
      );
    expect(inbox).toHaveLength(2);
  });

  it("does not resend before reservations open", async () => {
    const { festival } = await makeFestival({
      reservationsStartDate: new Date(Date.now() + HOUR),
    });
    admin = await makeUser({ role: "admin" });
    requireAdminOrFestivalAdmin.mockResolvedValue(admin);

    expect(
      await actions.resendReservationsOpenNotice({
        festivalId: festival.id,
        requestId: crypto.randomUUID(),
        channels: ALL,
      }),
    ).toMatchObject({ success: false });
    expect(await service.fetchReservationsOpenNotices(festival.id)).toEqual([]);
  });

  it("skips the automatic notice when it is off or the opening is over an hour old", async () => {
    const { festival: off } = await makeFestival({
      reservationsOpenNoticeAuto: false,
    });
    const { festival: late } = await makeFestival({
      reservationsStartDate: new Date(Date.now() - 2 * HOUR),
    });
    await makeUser();

    expect(
      await service.createReservationsOpenNotice({
        festivalId: off.id,
        trigger: "automatic",
        now: new Date(),
      }),
    ).toEqual({ kind: "disabled" });
    expect(
      await service.createReservationsOpenNotice({
        festivalId: late.id,
        trigger: "automatic",
        now: new Date(),
      }),
    ).toEqual({ kind: "too_late" });

    // An admin can still send either by hand.
    admin = await makeUser({ role: "admin" });
    requireAdminOrFestivalAdmin.mockResolvedValue(admin);
    for (const festival of [off, late]) {
      expect(
        await actions.resendReservationsOpenNotice({
          festivalId: festival.id,
          requestId: crypto.randomUUID(),
          channels: ALL,
        }),
      ).toMatchObject({ success: true, alreadySent: false });
    }
  });

  it("sends by email only when the festival says so, with no inbox item", async () => {
    const { festival } = await makeFestival({
      reservationsOpenNoticeInApp: false,
      reservationsOpenNoticePush: false,
    });
    const user = await makeUser({}, { devices: 1 });

    const run = await service.sendDueReservationsOpenNotices({
      deadline: Date.now() + 60_000,
    });
    const sent = run.sent.find((row) => row.festivalId === festival.id);
    expect(sent).toBeDefined();

    expect(await itemsFor(sent!.campaignId)).toEqual([]);
    const rows = await integrationDb!
      .select({
        userId: notificationDeliveries.userId,
        channel: notificationDeliveries.channel,
        status: notificationDeliveries.status,
        notificationId: notificationDeliveries.notificationId,
      })
      .from(notificationDeliveries)
      .where(
        and(
          eq(notificationDeliveries.campaignId, sent!.campaignId),
          inArray(notificationDeliveries.userId, mine()),
        ),
      );
    expect(rows).toEqual([
      {
        userId: user.id,
        channel: "email",
        status: "sent",
        notificationId: null,
      },
    ]);

    const [history] = await service.fetchReservationsOpenNotices(festival.id);
    expect(history).toMatchObject({
      trigger: "automatic",
      channels: { email: true, inApp: false, push: false },
      pushes: 0,
    });
    expect(history!.emailsSent).toBeGreaterThanOrEqual(1);
  }, 60_000);

  it("sends in Glitter without a push or an email when those are off", async () => {
    const { festival } = await makeFestival({
      reservationsOpenNoticeEmail: false,
      reservationsOpenNoticePush: false,
    });
    const user = await makeUser({}, { devices: 2 });

    const result = await service.createReservationsOpenNotice({
      festivalId: festival.id,
      trigger: "automatic",
      now: new Date(),
    });
    expect(result).toMatchObject({ kind: "sent", emails: 0, pushes: 0 });
    if (result.kind !== "sent") return;
    expect((await itemsFor(result.campaignId)).map((i) => i.userId)).toEqual([
      user.id,
    ]);
    expect(await deliveriesFor(result.campaignId)).toEqual([]);
  });

  it("refuses a resend whose push has no in-app item", async () => {
    const { festival } = await makeFestival();
    await makeUser();
    admin = await makeUser({ role: "admin" });
    requireAdminOrFestivalAdmin.mockResolvedValue(admin);

    expect(
      await actions.resendReservationsOpenNotice({
        festivalId: festival.id,
        requestId: crypto.randomUUID(),
        channels: { email: true, inApp: false, push: true },
      }),
    ).toMatchObject({ success: false });
    expect(await service.fetchReservationsOpenNotices(festival.id)).toEqual([]);
  });

  it("saves the festival's settings for staff, and keeps the channels valid", async () => {
    const { festival } = await makeFestival();
    const settings = {
      festivalId: festival.id,
      auto: false,
      channels: { email: true, inApp: false, push: false },
    };

    requireAdminOrFestivalAdmin.mockResolvedValue(null);
    expect(
      await actions.updateReservationsOpenNoticeSettings(settings),
    ).toEqual({ success: false, message: "No autorizado" });

    admin = await makeUser({ role: "admin" });
    requireAdminOrFestivalAdmin.mockResolvedValue(admin);
    expect(
      await actions.updateReservationsOpenNoticeSettings({
        ...settings,
        channels: { email: false, inApp: false, push: false },
      }),
    ).toMatchObject({ success: false });
    expect(
      await actions.updateReservationsOpenNoticeSettings({
        ...settings,
        channels: { email: true, inApp: false, push: true },
      }),
    ).toMatchObject({ success: false });

    expect(
      await actions.updateReservationsOpenNoticeSettings(settings),
    ).toEqual({ success: true });
    const [saved] = await integrationDb!
      .select({
        auto: festivals.reservationsOpenNoticeAuto,
        email: festivals.reservationsOpenNoticeEmail,
        inApp: festivals.reservationsOpenNoticeInApp,
        push: festivals.reservationsOpenNoticePush,
      })
      .from(festivals)
      .where(eq(festivals.id, festival.id));
    expect(saved).toEqual({
      auto: false,
      email: true,
      inApp: false,
      push: false,
    });

    await integrationDb!
      .update(festivals)
      .set({ status: "archived" })
      .where(eq(festivals.id, festival.id));
    expect(
      await actions.updateReservationsOpenNoticeSettings({
        ...settings,
        auto: true,
      }),
    ).toMatchObject({ success: false });
  });

  it("has the automatic notice on, through every channel, for a new festival", async () => {
    const { festival } = await makeFestival();
    expect(festival).toMatchObject({
      reservationsOpenNoticeAuto: true,
      reservationsOpenNoticeEmail: true,
      reservationsOpenNoticeInApp: true,
      reservationsOpenNoticePush: true,
    });
  });
});
