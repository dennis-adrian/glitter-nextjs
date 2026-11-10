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
  festivalSectors,
  festivalStandsAvailableReminders,
  festivalTermsDocuments,
  festivalTermsVersions,
  festivals,
  notificationCampaigns,
  notificationDeliveries,
  notifications,
  profileSubcategories,
  pushSubscriptions,
  reservationParticipants,
  standReservations,
  stands,
  standSubcategories,
  subcategories,
  userRequests,
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

let service: typeof import("@/app/lib/festivals/stands-available-reminders");
let notices: typeof import("@/app/lib/festivals/reservations-open-notices");
let actions: typeof import("@/app/lib/festivals/stands-available-actions");

const KIND = "festival_stands_available";
const HOUR = 60 * 60 * 1000;
const ALL = { email: true, inApp: true, push: true };

type Category = "illustration" | "gastronomy" | "entrepreneurship";

const created = {
  festivals: [] as number[],
  users: [] as number[],
  subcategories: [] as number[],
};

function tag() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

describeDatabase("stands-available reminders", () => {
  const subcategoryIds = {} as Record<Category, number>;
  let otherIllustrationSubcategoryId: number;
  let termsDocumentId: number;
  let termsVersionId: number;
  let admin: typeof users.$inferSelect | undefined;

  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";

    service = await import("@/app/lib/festivals/stands-available-reminders");
    notices = await import("@/app/lib/festivals/reservations-open-notices");
    actions = await import("@/app/lib/festivals/stands-available-actions");

    const result = await pool!.query<{ reminders: string | null }>(
      "select to_regclass('public.festival_stands_available_reminders')::text as reminders",
    );
    if (!result.rows[0]?.reminders) {
      throw new Error(
        "TEST_DATABASE_URL is safe but unmigrated; apply Drizzle migrations first.",
      );
    }

    const db = integrationDb!;
    for (const category of [
      "illustration",
      "gastronomy",
      "entrepreneurship",
    ] as const) {
      const [row] = await db
        .insert(subcategories)
        .values({ label: `Reminder ${category} ${tag()}`, category })
        .returning();
      subcategoryIds[category] = row!.id;
      created.subcategories.push(row!.id);
    }
    const [other] = await db
      .insert(subcategories)
      .values({ label: `Reminder other ${tag()}`, category: "illustration" })
      .returning();
    otherIllustrationSubcategoryId = other!.id;
    created.subcategories.push(other!.id);

    const [document] = await db
      .insert(festivalTermsDocuments)
      .values({ slug: `reminder-terms-${tag()}` })
      .returning();
    termsDocumentId = document!.id;
    const [version] = await db
      .insert(festivalTermsVersions)
      .values({ documentId: document!.id, versionNumber: 1 })
      .returning();
    termsVersionId = version!.id;
  }, 60_000);

  afterEach(async () => {
    requireAdminOrFestivalAdmin.mockReset();
    after.mockReset();
    // Deleted with the test's users below.
    admin = undefined;
    const db = integrationDb!;
    const festivalIds = created.festivals.splice(0);
    if (festivalIds.length > 0) {
      const reminders = await db
        .select({ campaignId: festivalStandsAvailableReminders.campaignId })
        .from(festivalStandsAvailableReminders)
        .where(
          inArray(festivalStandsAvailableReminders.festivalId, festivalIds),
        );
      await db
        .delete(userRequests)
        .where(inArray(userRequests.festivalId, festivalIds));
      await db
        .delete(standReservations)
        .where(inArray(standReservations.festivalId, festivalIds));
      await db.delete(stands).where(inArray(stands.festivalId, festivalIds));
      await db
        .delete(festivalSectors)
        .where(inArray(festivalSectors.festivalId, festivalIds));
      await db.delete(festivals).where(inArray(festivals.id, festivalIds));
      if (reminders.length > 0) {
        await db.delete(notificationCampaigns).where(
          inArray(
            notificationCampaigns.id,
            reminders.map((row) => row.campaignId),
          ),
        );
      }
    }
    const userIds = created.users.splice(0);
    if (userIds.length > 0) {
      await db.delete(users).where(inArray(users.id, userIds));
    }
  });

  afterAll(async () => {
    const db = integrationDb!;
    await db
      .delete(festivalTermsVersions)
      .where(eq(festivalTermsVersions.id, termsVersionId));
    await db
      .delete(festivalTermsDocuments)
      .where(eq(festivalTermsDocuments.id, termsDocumentId));
    const ids = created.subcategories.splice(0);
    if (ids.length > 0) {
      await db.delete(subcategories).where(inArray(subcategories.id, ids));
    }
    await pool?.end();
  });

  type StandSpec = {
    category: Category;
    status?: (typeof stands.$inferInsert)["status"];
    participationType?: (typeof stands.$inferInsert)["participationType"];
    /** Limits the stand to these subcategories. */
    onlyFor?: number[];
  };

  async function makeFestival(
    standSpecs: StandSpec[],
    values: Partial<typeof festivals.$inferInsert> = {},
  ) {
    const db = integrationDb!;
    const [festival] = await db
      .insert(festivals)
      .values({
        name: `Reminder ${tag()}`,
        status: "active",
        festivalType: "glitter",
        reservationsStartDate: new Date(Date.now() - 3 * HOUR),
        ...values,
      })
      .returning();
    created.festivals.push(festival!.id);
    const [sector] = await db
      .insert(festivalSectors)
      .values({ name: "Galería", festivalId: festival!.id })
      .returning();
    const standIds: number[] = [];
    for (const [index, spec] of standSpecs.entries()) {
      const [stand] = await db
        .insert(stands)
        .values({
          standNumber: index + 1,
          standCategory: spec.category,
          status: spec.status ?? "available",
          participationType: spec.participationType ?? "standard",
          festivalId: festival!.id,
          festivalSectorId: sector!.id,
        })
        .returning();
      standIds.push(stand!.id);
      for (const subcategoryId of spec.onlyFor ?? []) {
        await db
          .insert(standSubcategories)
          .values({ standId: stand!.id, subcategoryId });
      }
    }
    return { festival: festival!, standIds };
  }

  async function makeUser(
    festivalId: number,
    {
      category = "illustration",
      acceptedTerms = true,
      requestStatus = "accepted",
      subcategoryId,
      devices = 0,
      values = {},
    }: {
      category?: Category;
      acceptedTerms?: boolean;
      requestStatus?: "pending" | "accepted" | "rejected" | null;
      subcategoryId?: number;
      devices?: number;
      values?: Partial<typeof users.$inferInsert>;
    } = {},
  ) {
    const db = integrationDb!;
    const t = tag();
    const [user] = await db
      .insert(users)
      .values({
        clerkId: `clerk-reminder-${t}`,
        email: `reminder-${t}@example.test`,
        status: "verified",
        category,
        ...values,
      })
      .returning();
    created.users.push(user!.id);
    await db.insert(profileSubcategories).values({
      profileId: user!.id,
      subcategoryId: subcategoryId ?? subcategoryIds[category],
    });
    if (requestStatus) {
      await db.insert(userRequests).values({
        userId: user!.id,
        festivalId,
        type: "festival_participation",
        status: requestStatus,
        termsVersionId: acceptedTerms ? termsVersionId : null,
      });
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

  async function sendAs(
    festivalId: number,
    audience: "terms_accepted" | "all_eligible",
    channels = ALL,
  ) {
    admin ??= await makeUser(festivalId, {
      requestStatus: null,
      values: { role: "admin" },
    });
    requireAdminOrFestivalAdmin.mockResolvedValue(admin);
    return actions.sendStandsAvailableReminder({
      festivalId,
      requestId: crypto.randomUUID(),
      audience,
      channels,
    });
  }

  /**
   * Only this test's people: suites share the database and run in parallel,
   * and "all eligible" reaches every eligible participant in it.
   */
  function mine() {
    return created.users.length > 0 ? created.users : [-1];
  }

  async function itemsFor(campaignId: number) {
    return integrationDb!
      .select({
        userId: notifications.userId,
        body: notifications.body,
        data: notifications.data,
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

  async function lastCampaign(festivalId: number) {
    const [row] = await service.fetchStandsAvailableReminders(festivalId, 1);
    return row!;
  }

  it("reminds only people with a stand left for them who have not reserved", async () => {
    const { festival, standIds } = await makeFestival([
      { category: "illustration" },
      { category: "illustration", status: "reserved" },
      // Gastronomy has nothing left.
      { category: "gastronomy", status: "confirmed" },
      // Entrepreneurship's only free stand is for live activities.
      { category: "entrepreneurship", participationType: "live_activity" },
    ]);
    admin = await makeUser(festival.id, {
      requestStatus: null,
      values: { role: "admin" },
    });

    const reader = await makeUser(festival.id, { devices: 1 });
    const notAccepted = await makeUser(festival.id, {
      acceptedTerms: false,
      requestStatus: "pending",
    });
    const neverAsked = await makeUser(festival.id, { requestStatus: null });
    const turnedDown = await makeUser(festival.id, {
      requestStatus: "rejected",
    });
    const gastronomy = await makeUser(festival.id, { category: "gastronomy" });
    const standardEntrepreneur = await makeUser(festival.id, {
      category: "entrepreneurship",
    });
    const reserved = await makeUser(festival.id);
    const [reservation] = await integrationDb!
      .insert(standReservations)
      .values({
        standId: standIds[1]!,
        festivalId: festival.id,
        status: "accepted",
        ownerUserId: reserved.id,
      })
      .returning();
    await integrationDb!
      .insert(reservationParticipants)
      .values({ userId: reserved.id, reservationId: reservation!.id });
    const pausedUser = await makeUser(festival.id, {
      values: { status: "pending" },
    });

    expect(await service.countAvailableStands(festival.id)).toEqual({
      illustration: 1,
      entrepreneurship: 1,
    });
    // Accepting this festival's terms is this test's alone; "all eligible"
    // also counts other suites' participants.
    const audiences = await service.countStandsAvailableAudiences(festival.id);
    expect(audiences.terms_accepted).toEqual({ recipients: 1, withPush: 1 });
    expect(audiences.all_eligible.recipients).toBeGreaterThanOrEqual(3);

    const accepted = await sendAs(festival.id, "terms_accepted");
    expect(accepted).toMatchObject({
      success: true,
      recipients: 1,
      emails: 1,
      pushes: 1,
    });
    let campaign = await lastCampaign(festival.id);
    expect(
      (await itemsFor(campaign.campaignId)).map((item) => item.userId),
    ).toEqual([reader.id]);

    const everyone = await sendAs(festival.id, "all_eligible");
    expect(everyone).toMatchObject({ success: true });
    campaign = await lastCampaign(festival.id);
    expect(campaign.audience).toBe("all_eligible");
    expect(
      (await itemsFor(campaign.campaignId)).map((item) => item.userId).sort(),
    ).toEqual([reader.id, notAccepted.id, neverAsked.id].sort());

    for (const user of [
      turnedDown,
      gastronomy,
      standardEntrepreneur,
      reserved,
      pausedUser,
      admin,
    ]) {
      expect(
        (await itemsFor(campaign.campaignId)).some(
          (item) => item.userId === user.id,
        ),
      ).toBe(false);
    }
  });

  it("follows stands limited to some subcategories", async () => {
    const { festival } = await makeFestival([
      { category: "illustration", onlyFor: [otherIllustrationSubcategoryId] },
    ]);
    const outside = await makeUser(festival.id);
    const inside = await makeUser(festival.id, {
      subcategoryId: otherIllustrationSubcategoryId,
    });

    expect(await sendAs(festival.id, "terms_accepted")).toMatchObject({
      success: true,
      recipients: 1,
    });
    const campaign = await lastCampaign(festival.id);
    const items = await itemsFor(campaign.campaignId);
    expect(items.map((item) => item.userId)).toEqual([inside.id]);
    expect(items.some((item) => item.userId === outside.id)).toBe(false);
  });

  it("tells each person about their own category, by email too", async () => {
    const { festival } = await makeFestival([
      { category: "illustration" },
      { category: "gastronomy" },
    ]);
    const illustrator = await makeUser(festival.id);
    const cook = await makeUser(festival.id, { category: "gastronomy" });

    expect(await sendAs(festival.id, "terms_accepted")).toMatchObject({
      success: true,
      recipients: 2,
      emails: 2,
    });
    const campaign = await lastCampaign(festival.id);
    const items = await itemsFor(campaign.campaignId);
    const byUser = new Map(items.map((item) => [item.userId, item]));
    expect(byUser.get(illustrator.id)?.body).toContain("Ilustración");
    expect(byUser.get(cook.id)?.body).toContain("Gastronomía");
    expect(byUser.get(cook.id)?.data).toMatchObject({ category: "gastronomy" });

    // The send's own run, as `after` would start it.
    await notices.deliverFestivalNoticeCampaign(campaign.campaignId, {
      deadline: Date.now() + 60_000,
    });
    const emails = await integrationDb!
      .select({
        userId: notificationDeliveries.userId,
        status: notificationDeliveries.status,
      })
      .from(notificationDeliveries)
      .innerJoin(
        notifications,
        eq(notifications.id, notificationDeliveries.notificationId),
      )
      .where(
        and(
          eq(notifications.campaignId, campaign.campaignId),
          eq(notificationDeliveries.channel, "email"),
        ),
      );
    expect(emails.map((row) => row.status)).toEqual(["sent", "sent"]);
    expect(
      (await service.fetchStandsAvailableReminders(festival.id))[0],
    ).toMatchObject({ emails: 2, emailsSent: 2 });
  }, 60_000);

  it("sends by email only, with no inbox item, when asked", async () => {
    const { festival } = await makeFestival([{ category: "illustration" }]);
    const user = await makeUser(festival.id, { devices: 1 });

    expect(
      await sendAs(festival.id, "terms_accepted", {
        email: true,
        inApp: false,
        push: false,
      }),
    ).toMatchObject({ success: true, recipients: 1, emails: 1, pushes: 0 });
    const campaign = await lastCampaign(festival.id);
    expect(await itemsFor(campaign.campaignId)).toEqual([]);

    await notices.deliverFestivalNoticeCampaign(campaign.campaignId, {
      deadline: Date.now() + 60_000,
    });
    const rows = await integrationDb!
      .select({
        userId: notificationDeliveries.userId,
        status: notificationDeliveries.status,
        payload: notificationDeliveries.payload,
      })
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.campaignId, campaign.campaignId));
    expect(rows).toEqual([
      {
        userId: user.id,
        status: "sent",
        payload: expect.objectContaining({ category: "illustration" }),
      },
    ]);
  }, 60_000);

  it("refuses when it cannot be sent, and sends once per click", async () => {
    const { festival: upcoming } = await makeFestival(
      [{ category: "illustration" }],
      { reservationsStartDate: new Date(Date.now() + HOUR) },
    );
    await makeUser(upcoming.id);
    expect(await sendAs(upcoming.id, "terms_accepted")).toMatchObject({
      success: false,
      message: "Las reservas todavía no abrieron.",
    });

    const { festival: full } = await makeFestival([
      { category: "illustration", status: "confirmed" },
    ]);
    await makeUser(full.id);
    expect(await sendAs(full.id, "all_eligible")).toMatchObject({
      success: false,
    });
    expect(await service.fetchStandsAvailableReminders(full.id)).toEqual([]);

    requireAdminOrFestivalAdmin.mockResolvedValue(null);
    expect(
      await actions.sendStandsAvailableReminder({
        festivalId: upcoming.id,
        requestId: crypto.randomUUID(),
        audience: "terms_accepted",
        channels: ALL,
      }),
    ).toEqual({ success: false, message: "No autorizado" });

    const { festival: open } = await makeFestival([
      { category: "illustration" },
    ]);
    await makeUser(open.id);
    requireAdminOrFestivalAdmin.mockResolvedValue(admin);
    const requestId = crypto.randomUUID();
    const input = {
      festivalId: open.id,
      requestId,
      audience: "terms_accepted" as const,
      channels: ALL,
    };
    expect(await actions.sendStandsAvailableReminder(input)).toMatchObject({
      success: true,
      alreadySent: false,
    });
    expect(await actions.sendStandsAvailableReminder(input)).toMatchObject({
      success: true,
      alreadySent: true,
    });
    expect(await service.fetchStandsAvailableReminders(open.id)).toHaveLength(
      1,
    );
    expect(
      await actions.sendStandsAvailableReminder({
        ...input,
        requestId: crypto.randomUUID(),
        channels: { email: true, inApp: false, push: true },
      }),
    ).toMatchObject({ success: false });
  });
});
