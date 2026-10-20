// @vitest-environment node

import { randomUUID } from "crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
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

import { FESTIVAL_TERMS_DOCUMENT_SLUG } from "@/app/lib/festival-terms/constants";
import * as schema from "@/db/schema";
import {
  creditHolds,
  creditLedgerEntries,
  festivalReservationFeatures,
  festivalSectors,
  festivalTermsDocuments,
  festivalTermsVersions,
  festivals,
  invoices,
  reservationFeatureActionItems,
  reservationFeatureActions,
  reservationParticipants,
  reservationRequestRegistry,
  scheduledTasks,
  standGroups,
  standHolds,
  standReservationEvents,
  standReservations,
  stands,
  userRequests,
  users,
} from "@/db/schema";

const currentProfileMock = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: currentProfileMock,
}));
vi.mock("@/app/lib/reservations/notification-outbox", () => ({
  enqueueAdminAndOwnerNotifications: vi.fn().mockResolvedValue([]),
  enqueueReservationNotification: vi.fn(),
  scheduleReservationNotificationJobs: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

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
  ? new Pool({ connectionString: testDatabaseUrl, max: 5 })
  : null;
const integrationDb = pool ? drizzle(pool, { schema }) : null;
const describeDatabase = integrationDb ? describe : describe.skip;

type Fixture = {
  festivalId: number;
  sectorId: number;
  groupIds: number[];
  standIds: number[];
  userIds: number[];
  requestIds: number[];
};

const fixtures: Fixture[] = [];
let createStandHold: (typeof import("@/app/lib/reservations/hold-service"))["createStandHold"];
let confirmStandHold: (typeof import("@/app/lib/reservations/hold-service"))["confirmStandHold"];
let activateFullTableAccess: (typeof import("@/app/lib/reservations/full-table-service"))["activateFullTableAccess"];
let downgradeFullTableReservation: (typeof import("@/app/lib/reservations/full-table-service"))["downgradeFullTableReservation"];
let addLatePartner: (typeof import("@/app/lib/reservations/late-partner-service"))["addLatePartner"];
let fetchLatePartnerOffer: (typeof import("@/app/lib/reservations/late-partner-queries"))["fetchLatePartnerOffer"];
let latePartnerPrepaidAmount: (typeof import("@/app/lib/reservations/late-partner-prepaid"))["latePartnerPrepaidAmount"];
let readCreditBalances: (typeof import("@/app/lib/credits/service"))["readCreditBalances"];
let publishedTermsVersionId: number;

const ACCESS_PRICE = 50;
const STAND_PRICE = 200;
const SHARED_PRICE = 320;
/** A table is priced in its own right, whatever its headcount (PRD §7.1). */
const FULL_TABLE_PRICE = 380;
const LATE_PARTNER_PRICE = 25;
/** What a half table's late partner pays on top of the fee. */
const SHARED_DIFFERENCE = SHARED_PRICE - STAND_PRICE;

/**
 * A late partner on a full table (Dennis, 2026-09-29): the table costs the same
 * for one person or two, so the owner pays the late-partner fee alone.
 *
 * A full table's halves keep both illustration snapshots, which is how this
 * used to charge `shared - individual` on top of the fee for a second person
 * the table price already covered — and why a later downgrade then billed the
 * shared half a second time.
 */
describeDatabase("late partner on a full table", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl!;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";

    ({ createStandHold, confirmStandHold } =
      await import("@/app/lib/reservations/hold-service"));
    ({ activateFullTableAccess, downgradeFullTableReservation } =
      await import("@/app/lib/reservations/full-table-service"));
    ({ addLatePartner } =
      await import("@/app/lib/reservations/late-partner-service"));
    ({ fetchLatePartnerOffer } =
      await import("@/app/lib/reservations/late-partner-queries"));
    ({ latePartnerPrepaidAmount } =
      await import("@/app/lib/reservations/late-partner-prepaid"));
    ({ readCreditBalances } = await import("@/app/lib/credits/service"));

    const db = integrationDb!;
    const document = await db.query.festivalTermsDocuments.findFirst({
      where: eq(festivalTermsDocuments.slug, FESTIVAL_TERMS_DOCUMENT_SLUG),
    });
    if (!document) {
      throw new Error(
        "TEST_DATABASE_URL is safe but unmigrated; apply Drizzle migrations first.",
      );
    }
    const published = await db.query.festivalTermsVersions.findFirst({
      where: eq(festivalTermsVersions.status, "published"),
      orderBy: [desc(festivalTermsVersions.versionNumber)],
    });
    if (!published) {
      throw new Error("Missing published festival terms version in test DB.");
    }
    publishedTermsVersionId = published.id;
  }, 60_000);

  afterEach(async () => {
    currentProfileMock.mockReset();
    const db = integrationDb!;
    for (const fixture of fixtures.splice(0)) {
      const reservationRows = await db
        .select({ id: standReservations.id })
        .from(standReservations)
        .where(eq(standReservations.festivalId, fixture.festivalId));
      const reservationIds = reservationRows.map((row) => row.id);
      if (reservationIds.length > 0) {
        await db
          .delete(invoices)
          .where(inArray(invoices.reservationId, reservationIds));
        await db
          .delete(scheduledTasks)
          .where(inArray(scheduledTasks.reservationId, reservationIds));
        await db
          .delete(standReservationEvents)
          .where(inArray(standReservationEvents.reservationId, reservationIds));
        await db
          .delete(reservationParticipants)
          .where(
            inArray(reservationParticipants.reservationId, reservationIds),
          );
      }
      if (fixture.userIds.length > 0) {
        await db
          .delete(creditHolds)
          .where(inArray(creditHolds.userId, fixture.userIds));
        // The ledger is append-only in production, enforced by a trigger. It is
        // dropped only for this delete and restored immediately, so no test can
        // run against a database that is missing it.
        const client = await pool!.connect();
        try {
          await client.query(
            "ALTER TABLE credit_ledger_entries DISABLE TRIGGER credit_ledger_entries_append_only",
          );
          await client.query(
            `DELETE FROM credit_ledger_entries WHERE user_id = ANY($1::int[])`,
            [fixture.userIds],
          );
        } finally {
          await client.query(
            "ALTER TABLE credit_ledger_entries ENABLE TRIGGER credit_ledger_entries_append_only",
          );
          client.release();
        }
        await db
          .delete(reservationRequestRegistry)
          .where(
            inArray(reservationRequestRegistry.actorUserId, fixture.userIds),
          );
      }
      await db
        .delete(reservationFeatureActions)
        .where(eq(reservationFeatureActions.festivalId, fixture.festivalId));
      if (reservationIds.length > 0) {
        await db
          .delete(standReservations)
          .where(inArray(standReservations.id, reservationIds));
      }
      await db
        .delete(standHolds)
        .where(eq(standHolds.festivalId, fixture.festivalId));
      await db
        .delete(festivalReservationFeatures)
        .where(eq(festivalReservationFeatures.festivalId, fixture.festivalId));
      if (fixture.standIds.length > 0) {
        await db.delete(stands).where(inArray(stands.id, fixture.standIds));
      }
      if (fixture.groupIds.length > 0) {
        await db
          .delete(standGroups)
          .where(inArray(standGroups.id, fixture.groupIds));
      }
      await db
        .delete(festivalSectors)
        .where(eq(festivalSectors.id, fixture.sectorId));
      if (fixture.requestIds.length > 0) {
        await db
          .delete(userRequests)
          .where(inArray(userRequests.id, fixture.requestIds));
      }
      if (fixture.userIds.length > 0) {
        await db.delete(users).where(inArray(users.id, fixture.userIds));
      }
      await db.delete(festivals).where(eq(festivals.id, fixture.festivalId));
    }
  });

  afterAll(async () => {
    await pool?.end();
  });

  /**
   * One illustration pair priced as a table, with both the full-table and the
   * late-partner features on, an owner holding `credits`, and an eligible
   * partner who is enrolled but not booked.
   */
  async function seed(credits: number) {
    const db = integrationDb!;
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const [festival] = await db
      .insert(festivals)
      .values({
        name: `Late Partner Table ${suffix}`,
        status: "active",
        festivalType: "glitter",
        participantTermsEnabled: true,
        reservationsStartDate: new Date(Date.now() - 60_000),
      })
      .returning();

    const [sector] = await db
      .insert(festivalSectors)
      .values({
        festivalId: festival.id,
        name: `S ${suffix}`,
        orderInFestival: 1,
      })
      .returning();

    const [owner, partner] = await db
      .insert(users)
      .values(
        ["owner", "partner"].map((role) => ({
          clerkId: `lpft-${suffix}-${role}`,
          email: `lpft-${suffix}-${role}@example.test`,
          displayName: `LPFT ${suffix} ${role}`,
          status: "verified" as const,
          category: "illustration" as const,
        })),
      )
      .returning();

    const enrollments = await db
      .insert(userRequests)
      .values(
        [owner, partner].map((user) => ({
          userId: user.id,
          festivalId: festival.id,
          type: "festival_participation" as const,
          status: "accepted" as const,
          termsVersionId: publishedTermsVersionId,
        })),
      )
      .returning();

    const [group] = await db
      .insert(standGroups)
      .values({
        festivalSectorId: sector.id,
        type: "full_table" as const,
        fullTablePrice: FULL_TABLE_PRICE,
      })
      .returning();

    const pairStands = await db
      .insert(stands)
      .values(
        Array.from({ length: 2 }, (_, index) => ({
          festivalId: festival.id,
          festivalSectorId: sector.id,
          standNumber: index + 1,
          standCategory: "illustration" as const,
          status: "available" as const,
          price: STAND_PRICE,
          individualPrice: STAND_PRICE,
          // A real illustration table: both halves agree on both prices, so
          // the shared snapshot the old rule priced from is really there.
          sharedPrice: SHARED_PRICE,
          standGroupId: group.id,
          positionLeft: 0,
          positionTop: 0,
        })),
      )
      .returning();

    await db.insert(festivalReservationFeatures).values([
      {
        festivalId: festival.id,
        type: "full_table" as const,
        category: "illustration" as const,
        enabled: true,
        creditPrice: ACCESS_PRICE,
      },
      {
        festivalId: festival.id,
        type: "late_partner" as const,
        category: null,
        enabled: true,
        creditPrice: LATE_PARTNER_PRICE,
        // Well clear of `now`, so the deadline is never what a test trips on.
        deadlineOverrideAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    ]);

    if (credits > 0) {
      await db.insert(creditLedgerEntries).values({
        userId: owner.id,
        amount: credits,
        type: "admin_grant" as const,
        idempotencyKey: `grant-${suffix}-${owner.id}`,
      });
    }

    fixtures.push({
      festivalId: festival.id,
      sectorId: sector.id,
      groupIds: [group.id],
      standIds: pairStands.map((stand) => stand.id),
      userIds: [owner.id, partner.id],
      requestIds: enrollments.map((row) => row.id),
    });

    return {
      festival,
      owner,
      partner,
      standIds: pairStands.map((stand) => stand.id),
    };
  }

  function asUser(user: { id: number }, role: "user" | "admin" = "user") {
    currentProfileMock.mockResolvedValue({
      id: user.id,
      role,
      status: "verified",
      category: "illustration",
    });
  }

  /** Books the owner's stand: the whole table with `fullTable`, else a half. */
  async function book(
    seeded: Awaited<ReturnType<typeof seed>>,
    options: { fullTable: boolean },
  ) {
    asUser(seeded.owner);
    if (options.fullTable) {
      const activated = await activateFullTableAccess({
        festivalId: seeded.festival.id,
        idempotencyKey: randomUUID(),
      });
      expect(activated.success).toBe(true);
    }
    const held = await createStandHold({
      standId: seeded.standIds[0],
      idempotencyKey: randomUUID(),
    });
    expect(held).toMatchObject({
      success: true,
      data: { isFullTable: options.fullTable },
    });
    const [hold] = await integrationDb!
      .select({ id: standHolds.id })
      .from(standHolds)
      .where(eq(standHolds.festivalId, seeded.festival.id));
    const confirmed = await confirmStandHold({
      holdId: hold.id,
      idempotencyKey: randomUUID(),
    });
    expect(confirmed.success).toBe(true);
    return (confirmed as { data: { reservationId: number } }).data
      .reservationId;
  }

  async function lateItems(reservationId: number) {
    const rows = await integrationDb!
      .select({
        kind: reservationFeatureActionItems.kind,
        amount: reservationFeatureActionItems.amount,
      })
      .from(reservationFeatureActionItems)
      .innerJoin(
        reservationFeatureActions,
        eq(
          reservationFeatureActions.id,
          reservationFeatureActionItems.featureActionId,
        ),
      )
      .where(
        and(
          eq(reservationFeatureActions.reservationId, reservationId),
          eq(reservationFeatureActions.type, "late_partner"),
        ),
      );
    return Object.fromEntries(rows.map((row) => [row.kind, row.amount]));
  }

  async function spends(userId: number) {
    const rows = await integrationDb!
      .select({ amount: creditLedgerEntries.amount })
      .from(creditLedgerEntries)
      .where(
        and(
          eq(creditLedgerEntries.userId, userId),
          eq(creditLedgerEntries.type, "spend"),
        ),
      );
    return rows.map((row) => row.amount).sort((a, b) => a - b);
  }

  async function invoiceRows(reservationId: number) {
    return integrationDb!
      .select({
        amount: invoices.amount,
        originalAmount: invoices.originalAmount,
        status: invoices.status,
      })
      .from(invoices)
      .where(eq(invoices.reservationId, reservationId));
  }

  it("quotes the fee alone to a full-table owner", async () => {
    const seeded = await seed(ACCESS_PRICE + LATE_PARTNER_PRICE);
    const reservationId = await book(seeded, { fullTable: true });

    const offer = await fetchLatePartnerOffer({
      reservationId,
      userId: seeded.owner.id,
    });

    expect(offer).toMatchObject({
      offered: true,
      fullTable: true,
      sharedPriceDifference: 0,
      featurePrice: LATE_PARTNER_PRICE,
      totalCredits: LATE_PARTNER_PRICE,
      // The access fee is captured; what is left is exactly the fee.
      spendableBalance: LATE_PARTNER_PRICE,
      shortfall: 0,
    });
  });

  /**
   * Funded with the fee alone on purpose: under the old rule the same owner
   * would have been refused for want of the Bs120 difference.
   */
  it("debits only the fee and leaves the table's cobro alone", async () => {
    const seeded = await seed(ACCESS_PRICE + LATE_PARTNER_PRICE);
    const reservationId = await book(seeded, { fullTable: true });
    const before = await invoiceRows(reservationId);
    expect(before).toEqual([
      {
        amount: FULL_TABLE_PRICE,
        originalAmount: FULL_TABLE_PRICE,
        status: "pending",
      },
    ]);

    const result = await addLatePartner({
      reservationId,
      partnerUserId: seeded.partner.id,
      idempotencyKey: randomUUID(),
    });
    expect(result.success).toBe(true);

    // Two spends in the owner's history: the table's access fee, captured at
    // booking, and the late-partner fee. Nothing for the headcount.
    expect(await spends(seeded.owner.id)).toEqual([
      -ACCESS_PRICE,
      -LATE_PARTNER_PRICE,
    ]);
    expect((await readCreditBalances(seeded.owner.id)).ledgerBalance).toBe(0);

    // Both items still written, the difference at zero, so every late
    // partner keeps the same accounting shape.
    expect(await lateItems(reservationId)).toEqual({
      shared_price_difference: 0,
      feature_access: LATE_PARTNER_PRICE,
    });

    expect(await invoiceRows(reservationId)).toEqual(before);

    const participants = await integrationDb!
      .select({ userId: reservationParticipants.userId })
      .from(reservationParticipants)
      .where(eq(reservationParticipants.reservationId, reservationId));
    expect(new Set(participants.map((row) => row.userId))).toEqual(
      new Set([seeded.owner.id, seeded.partner.id]),
    );

    const [reservation] = await integrationDb!
      .select({
        bookedParticipantCount: standReservations.bookedParticipantCount,
        fullTablePriceSnapshot: standReservations.fullTablePriceSnapshot,
        priceAmountSnapshot: standReservations.priceAmountSnapshot,
      })
      .from(standReservations)
      .where(eq(standReservations.id, reservationId));
    expect(reservation).toEqual({
      bookedParticipantCount: 2,
      fullTablePriceSnapshot: FULL_TABLE_PRICE,
      priceAmountSnapshot: FULL_TABLE_PRICE,
    });

    // The history says it was a table, so the console can explain the total.
    const [event] = await integrationDb!
      .select({ payload: standReservationEvents.payload })
      .from(standReservationEvents)
      .where(
        and(
          eq(standReservationEvents.reservationId, reservationId),
          eq(standReservationEvents.eventType, "status_changed"),
        ),
      );
    expect(event.payload).toMatchObject({
      action: "late_partner_added",
      sharedPriceDifference: 0,
      featurePrice: LATE_PARTNER_PRICE,
      totalCredits: LATE_PARTNER_PRICE,
      fullTable: true,
    });
  });

  /**
   * Nothing was prepaid towards the stand, so repricing counts nothing: a
   * later downgrade of the unpaid table bills the two-person half in full,
   * once. Under the old rule the owner paid the difference in credits and
   * again on the downgraded cobro.
   */
  it("leaves nothing prepaid, so a downgrade bills the shared half once", async () => {
    const seeded = await seed(ACCESS_PRICE + LATE_PARTNER_PRICE);
    const reservationId = await book(seeded, { fullTable: true });
    const added = await addLatePartner({
      reservationId,
      partnerUserId: seeded.partner.id,
      idempotencyKey: randomUUID(),
    });
    expect(added.success).toBe(true);

    expect(
      await integrationDb!.transaction((tx) =>
        latePartnerPrepaidAmount(tx, reservationId),
      ),
    ).toBe(0);

    asUser(seeded.owner, "admin");
    const downgraded = await downgradeFullTableReservation({
      reservationId,
      idempotencyKey: randomUUID(),
    });
    expect(downgraded).toMatchObject({ success: true });

    expect(await invoiceRows(reservationId)).toEqual([
      {
        amount: SHARED_PRICE,
        originalAmount: SHARED_PRICE,
        status: "pending",
      },
    ]);
  });

  /** The half-table rule is unchanged: the difference and the fee. */
  it("still charges a half table the difference plus the fee", async () => {
    const seeded = await seed(SHARED_DIFFERENCE + LATE_PARTNER_PRICE);
    const reservationId = await book(seeded, { fullTable: false });

    const offer = await fetchLatePartnerOffer({
      reservationId,
      userId: seeded.owner.id,
    });
    expect(offer).toMatchObject({
      offered: true,
      fullTable: false,
      sharedPriceDifference: SHARED_DIFFERENCE,
      totalCredits: SHARED_DIFFERENCE + LATE_PARTNER_PRICE,
      shortfall: 0,
    });

    const result = await addLatePartner({
      reservationId,
      partnerUserId: seeded.partner.id,
      idempotencyKey: randomUUID(),
    });
    expect(result.success).toBe(true);

    expect(await spends(seeded.owner.id)).toEqual([
      -(SHARED_DIFFERENCE + LATE_PARTNER_PRICE),
    ]);
    expect(await lateItems(reservationId)).toEqual({
      shared_price_difference: SHARED_DIFFERENCE,
      feature_access: LATE_PARTNER_PRICE,
    });
    expect(
      await integrationDb!.transaction((tx) =>
        latePartnerPrepaidAmount(tx, reservationId),
      ),
    ).toBe(SHARED_DIFFERENCE);
  });
});
