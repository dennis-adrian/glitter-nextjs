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

import { canFundInvoiceCreditAllocation } from "@/app/lib/credits/balances";
import { FESTIVAL_TERMS_DOCUMENT_SLUG } from "@/app/lib/festival-terms/constants";
import * as schema from "@/db/schema";
import {
  creditHolds,
  creditLedgerEntries,
  creditTopUps,
  festivalReservationFeatures,
  festivalSectors,
  festivalTermsDocuments,
  festivalTermsVersions,
  festivals,
  invoices,
  reservationFeatureActions,
  reservationNotificationJobs,
  reservationParticipants,
  reservationRequestRegistry,
  scheduledTasks,
  standGroups,
  standHolds,
  standReservationEvents,
  standReservationStands,
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
let createFeatureCreditTopUp: (typeof import("@/app/lib/credits/purchase-service"))["createFeatureCreditTopUp"];
let createDebtCreditTopUp: (typeof import("@/app/lib/credits/purchase-service"))["createDebtCreditTopUp"];
let submitCreditTopUpVoucher: (typeof import("@/app/lib/credits/service"))["submitCreditTopUpVoucher"];
let reviewCreditTopUp: (typeof import("@/app/lib/credits/service"))["reviewCreditTopUp"];
let readCreditBalances: (typeof import("@/app/lib/credits/service"))["readCreditBalances"];
let activateFullTableAccess: (typeof import("@/app/lib/reservations/full-table-service"))["activateFullTableAccess"];
let activateFullTableAccessAfterPurchase: (typeof import("@/app/lib/reservations/full-table-service"))["activateFullTableAccessAfterPurchase"];
let createStandHold: (typeof import("@/app/lib/reservations/hold-service"))["createStandHold"];
let confirmStandHold: (typeof import("@/app/lib/reservations/hold-service"))["confirmStandHold"];
let publishedTermsVersionId: number;

const ACCESS_PRICE = 50;
const STAND_PRICE = 200;
const SHARED_PRICE = 320;
/** A table is priced in its own right and is not inventory without one. */
const FULL_TABLE_PRICE = 380;
const UPLOAD_WINDOW_MS = 10 * 60 * 1000;

/**
 * Buying credits for an optional feature (PRD §17, §18).
 *
 * Every purchase is the exact shortfall for one named use, sized on the server
 * from the festival's configured price and the ledger — never from an amount
 * the browser sends. The cases here are the ones where getting it wrong costs
 * someone money: a second stacked session, a purchase that outlives its upload
 * window, and a rejection landing after the credits were already spent.
 */
describeDatabase("feature credit top-up", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl!;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";

    ({ createFeatureCreditTopUp, createDebtCreditTopUp } =
      await import("@/app/lib/credits/purchase-service"));
    ({ submitCreditTopUpVoucher, reviewCreditTopUp, readCreditBalances } =
      await import("@/app/lib/credits/service"));
    ({ activateFullTableAccess, activateFullTableAccessAfterPurchase } =
      await import("@/app/lib/reservations/full-table-service"));
    ({ createStandHold, confirmStandHold } =
      await import("@/app/lib/reservations/hold-service"));

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
          .delete(creditTopUps)
          .where(inArray(creditTopUps.userId, fixture.userIds));
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

  async function seed(options?: {
    credits?: number;
    /** Days from now the map opens; negative means reservations are open. */
    opensInDays?: number;
  }) {
    const db = integrationDb!;
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const opensInDays = options?.opensInDays ?? -1;

    const [festival] = await db
      .insert(festivals)
      .values({
        name: `Feature TopUp ${suffix}`,
        status: "active",
        festivalType: "glitter",
        participantTermsEnabled: true,
        reservationsStartDate: new Date(
          Date.now() + opensInDays * 24 * 60 * 60 * 1000,
        ),
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

    const [user] = await db
      .insert(users)
      .values({
        clerkId: `ctu-${suffix}`,
        email: `ctu-${suffix}@example.test`,
        displayName: `CTU ${suffix}`,
        status: "verified" as const,
        category: "illustration" as const,
      })
      .returning();

    const enrollments = await db
      .insert(userRequests)
      .values({
        userId: user.id,
        festivalId: festival.id,
        type: "festival_participation" as const,
        status: "accepted" as const,
        termsVersionId: publishedTermsVersionId,
      })
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
          sharedPrice: SHARED_PRICE,
          standGroupId: group.id,
          positionLeft: 0,
          positionTop: 0,
        })),
      )
      .returning();

    await db.insert(festivalReservationFeatures).values({
      festivalId: festival.id,
      type: "full_table" as const,
      category: "illustration" as const,
      enabled: true,
      creditPrice: ACCESS_PRICE,
    });

    const credits = options?.credits ?? 0;
    if (credits !== 0) {
      await db.insert(creditLedgerEntries).values({
        userId: user.id,
        amount: credits,
        type: "admin_grant" as const,
        idempotencyKey: `grant-${suffix}-${user.id}`,
      });
    }

    fixtures.push({
      festivalId: festival.id,
      sectorId: sector.id,
      groupIds: [group.id],
      standIds: pairStands.map((stand) => stand.id),
      userIds: [user.id],
      requestIds: enrollments.map((row) => row.id),
    });

    currentProfileMock.mockResolvedValue({
      id: user.id,
      role: "user",
      status: "verified",
      category: "illustration",
    });

    return {
      festival,
      user,
      standIds: pairStands.map((stand) => stand.id),
    };
  }

  async function topUpsFor(userId: number) {
    return integrationDb!
      .select({
        id: creditTopUps.id,
        amount: creditTopUps.amount,
        status: creditTopUps.status,
        intendedUseType: creditTopUps.intendedUseType,
        intendedUseId: creditTopUps.intendedUseId,
        uploadDeadlineAt: creditTopUps.uploadDeadlineAt,
      })
      .from(creditTopUps)
      .where(eq(creditTopUps.userId, userId));
  }

  it("issues exactly the shortfall, once, inside the upload window", async () => {
    const { festival, user } = await seed({ credits: 20 });
    const before = Date.now();

    const result = await createFeatureCreditTopUp({
      festivalId: festival.id,
      featureType: "full_table",
      idempotencyKey: randomUUID(),
    });

    expect(result).toMatchObject({
      success: true,
      // 50 to activate, 20 already spendable: the participant is asked for the
      // difference and never for a round number of their own choosing.
      data: { amount: ACCESS_PRICE - 20 },
    });

    const rows = await topUpsFor(user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      amount: ACCESS_PRICE - 20,
      status: "awaiting_voucher",
      intendedUseType: "feature",
      intendedUseId: festival.id,
    });

    const deadline = rows[0].uploadDeadlineAt.getTime();
    expect(deadline).toBeGreaterThan(before);
    expect(deadline).toBeLessThanOrEqual(Date.now() + UPLOAD_WINDOW_MS);

    // Opening a purchase issues nothing: credits appear only once a voucher is
    // uploaded.
    const balances = await readCreditBalances(user.id);
    expect(balances.ledgerBalance).toBe(20);
  });

  it("resumes the open purchase instead of stacking a second one", async () => {
    const { festival, user } = await seed({ credits: 20 });

    const first = await createFeatureCreditTopUp({
      festivalId: festival.id,
      featureType: "full_table",
      idempotencyKey: randomUUID(),
    });
    expect(first.success).toBe(true);
    const firstId = (first as { data: { topUpId: number } }).data.topUpId;

    // A fresh key, as a second tab or a second click would send.
    const second = await createFeatureCreditTopUp({
      festivalId: festival.id,
      featureType: "full_table",
      idempotencyKey: randomUUID(),
    });

    expect(second).toMatchObject({ success: true, data: { topUpId: firstId } });
    expect(await topUpsFor(user.id)).toHaveLength(1);
  });

  it("replays the same purchase for a retry of the same request", async () => {
    const { festival, user } = await seed({ credits: 20 });
    const key = randomUUID();

    const first = await createFeatureCreditTopUp({
      festivalId: festival.id,
      featureType: "full_table",
      idempotencyKey: key,
    });
    const replay = await createFeatureCreditTopUp({
      festivalId: festival.id,
      featureType: "full_table",
      idempotencyKey: key,
    });

    expect(first.success).toBe(true);
    expect(replay).toMatchObject({
      success: true,
      data: { topUpId: (first as { data: { topUpId: number } }).data.topUpId },
    });
    expect(await topUpsFor(user.id)).toHaveLength(1);
  });

  it("issues nothing for a purchase whose window ran out, and lets a new one start", async () => {
    const { festival, user } = await seed({ credits: 20 });

    const first = await createFeatureCreditTopUp({
      festivalId: festival.id,
      featureType: "full_table",
      idempotencyKey: randomUUID(),
    });
    const expiredId = (first as { data: { topUpId: number } }).data.topUpId;

    // Age the session rather than waiting ten minutes. Both timestamps move:
    // a column check keeps the deadline after creation, which is the same
    // invariant that stops a purchase being born already expired.
    await integrationDb!
      .update(creditTopUps)
      .set({
        createdAt: new Date(Date.now() - 2 * UPLOAD_WINDOW_MS),
        uploadDeadlineAt: new Date(Date.now() - UPLOAD_WINDOW_MS),
      })
      .where(eq(creditTopUps.id, expiredId));

    const late = await submitCreditTopUpVoucher({
      topUpId: expiredId,
      userId: user.id,
      voucherUrl: "https://example.test/late.png",
      fileKey: `late-${expiredId}`,
    });
    expect(late).toMatchObject({ ok: false, code: "TOP_UP_EXPIRED" });

    // Nothing was credited, and the dead session is marked rather than left
    // to block the next attempt.
    const balances = await readCreditBalances(user.id);
    expect(balances.ledgerBalance).toBe(20);

    const second = await createFeatureCreditTopUp({
      festivalId: festival.id,
      featureType: "full_table",
      idempotencyKey: randomUUID(),
    });
    expect(second.success).toBe(true);
    const secondId = (second as { data: { topUpId: number } }).data.topUpId;
    expect(secondId).not.toBe(expiredId);
    expect(await topUpsFor(user.id)).toHaveLength(2);
  });

  /**
   * Buying from a full-table screen already says what the credits are for, so
   * the purchase stands in for pressing "Activar". The intent is recorded on
   * the top-up itself, which is what makes it safe to act on after the fact.
   */
  it("activates the feature off the purchase that funded it", async () => {
    const { festival, user } = await seed({ credits: 0 });

    const purchase = await createFeatureCreditTopUp({
      festivalId: festival.id,
      featureType: "full_table",
      idempotencyKey: randomUUID(),
    });
    const topUpId = (purchase as { data: { topUpId: number } }).data.topUpId;

    await submitCreditTopUpVoucher({
      topUpId,
      userId: user.id,
      voucherUrl: "https://example.test/v.png",
      fileKey: `voucher-${topUpId}`,
    });

    const activation = await activateFullTableAccessAfterPurchase({
      userId: user.id,
      festivalId: festival.id,
      topUpId,
    });

    expect(activation).toMatchObject({
      success: true,
      data: { alreadyActive: false },
    });
    // The credits the purchase issued are held against the access now, not
    // left free to spend on something else.
    const balances = await readCreditBalances(user.id);
    expect(balances).toMatchObject({
      ledgerBalance: ACCESS_PRICE,
      spendableBalance: 0,
      activeHolds: ACCESS_PRICE,
    });
  });

  /**
   * The upload callback is retried by UploadThing, and the request registry is
   * the only thing between a retry and a second hold on the same credits.
   */
  it("does not activate twice when the upload callback is retried", async () => {
    const { festival, user } = await seed({ credits: 0 });

    const purchase = await createFeatureCreditTopUp({
      festivalId: festival.id,
      featureType: "full_table",
      idempotencyKey: randomUUID(),
    });
    const topUpId = (purchase as { data: { topUpId: number } }).data.topUpId;
    await submitCreditTopUpVoucher({
      topUpId,
      userId: user.id,
      voucherUrl: "https://example.test/v.png",
      fileKey: `voucher-${topUpId}`,
    });

    const first = await activateFullTableAccessAfterPurchase({
      userId: user.id,
      festivalId: festival.id,
      topUpId,
    });
    const second = await activateFullTableAccessAfterPurchase({
      userId: user.id,
      festivalId: festival.id,
      topUpId,
    });

    expect(first.success).toBe(true);
    expect(second).toMatchObject({
      success: true,
      data: { alreadyActive: true },
    });

    const balances = await readCreditBalances(user.id);
    expect(balances.activeHolds).toBe(ACCESS_PRICE);
  });

  /**
   * The intent is what the caller branches on: only a `feature` purchase is
   * consent to activate. An invoice or debt top-up funds something else and
   * has to leave the credits alone.
   */
  it("reports what the completed purchase was for", async () => {
    const { festival, user } = await seed({ credits: 0 });

    const purchase = await createFeatureCreditTopUp({
      festivalId: festival.id,
      featureType: "full_table",
      idempotencyKey: randomUUID(),
    });
    const topUpId = (purchase as { data: { topUpId: number } }).data.topUpId;

    const submitted = await submitCreditTopUpVoucher({
      topUpId,
      userId: user.id,
      voucherUrl: "https://example.test/v.png",
      fileKey: `voucher-${topUpId}`,
    });

    expect(submitted).toMatchObject({
      ok: true,
      data: { intendedUse: { type: "feature", id: festival.id } },
    });

    // A replayed submission has to report the same intent, or a retried
    // callback would skip the activation the first one earned.
    const replay = await submitCreditTopUpVoucher({
      topUpId,
      userId: user.id,
      voucherUrl: "https://example.test/v.png",
      fileKey: `voucher-${topUpId}`,
    });
    expect(replay).toMatchObject({
      ok: true,
      data: { intendedUse: { type: "feature", id: festival.id } },
    });
  });

  it("refuses a purchase the participant does not need", async () => {
    const { festival } = await seed({ credits: ACCESS_PRICE });

    const result = await createFeatureCreditTopUp({
      festivalId: festival.id,
      featureType: "full_table",
      idempotencyKey: randomUUID(),
    });

    expect(result).toMatchObject({
      success: false,
      code: "CREDIT_TOP_UP_NOT_NEEDED",
    });
  });

  it("sells credits during the days before the map opens", async () => {
    // The whole point of the two-day window: the money question is settled
    // before the high-friction flow, so the reservation clock must not block it.
    const { festival, user } = await seed({ credits: 0, opensInDays: 2 });

    const purchase = await createFeatureCreditTopUp({
      festivalId: festival.id,
      featureType: "full_table",
      idempotencyKey: randomUUID(),
    });
    expect(purchase).toMatchObject({
      success: true,
      data: { amount: ACCESS_PRICE },
    });

    const topUpId = (purchase as { data: { topUpId: number } }).data.topUpId;
    await submitCreditTopUpVoucher({
      topUpId,
      userId: user.id,
      voucherUrl: "https://example.test/v.png",
      fileKey: `v-${topUpId}`,
    });

    // Provisional credits are spendable on an optional feature straight away.
    const activated = await activateFullTableAccess({
      festivalId: festival.id,
      idempotencyKey: randomUUID(),
    });
    expect(activated.success).toBe(true);
  });

  it("refuses to sell credits to someone who never enrolled", async () => {
    const { festival, user } = await seed({ credits: 0, opensInDays: 2 });
    // Reservations are not open, so the page-level policy would answer
    // RESERVATIONS_NOT_OPEN and mask this. The command has to check for itself.
    await integrationDb!
      .delete(userRequests)
      .where(eq(userRequests.userId, user.id));

    const result = await createFeatureCreditTopUp({
      festivalId: festival.id,
      featureType: "full_table",
      idempotencyKey: randomUUID(),
    });

    expect(result).toMatchObject({ success: false, code: "NOT_ENROLLED" });
    expect(await topUpsFor(user.id)).toHaveLength(0);
  });

  it("refuses activation while the balance is negative", async () => {
    const { festival, user } = await seed({ credits: 0 });
    // A reversal left this account owing more than it holds.
    await integrationDb!.insert(creditLedgerEntries).values({
      userId: user.id,
      amount: -30,
      type: "admin_adjustment" as const,
      idempotencyKey: `debt-${user.id}-${randomUUID()}`,
    });
    // Even with enough gross credit granted afterwards, a negative ledger
    // blocks every credit operation until it is cleared.
    await integrationDb!.insert(creditLedgerEntries).values({
      userId: user.id,
      amount: 20,
      type: "admin_grant" as const,
      idempotencyKey: `grant-${user.id}-${randomUUID()}`,
    });

    const result = await activateFullTableAccess({
      festivalId: festival.id,
      idempotencyKey: randomUUID(),
    });

    expect(result).toMatchObject({
      success: false,
      code: "FULL_TABLE_INSUFFICIENT_CREDITS",
    });
    expect(
      await integrationDb!
        .select({ id: creditHolds.id })
        .from(creditHolds)
        .where(eq(creditHolds.userId, user.id)),
    ).toHaveLength(0);
  });

  it("leaves the reservation standing when a voucher is rejected after the spend", async () => {
    const { festival, user, standIds } = await seed({ credits: 0 });

    const purchase = await createFeatureCreditTopUp({
      festivalId: festival.id,
      featureType: "full_table",
      idempotencyKey: randomUUID(),
    });
    const topUpId = (purchase as { data: { topUpId: number } }).data.topUpId;
    await submitCreditTopUpVoucher({
      topUpId,
      userId: user.id,
      voucherUrl: "https://example.test/v.png",
      fileKey: `v-${topUpId}`,
    });

    const activated = await activateFullTableAccess({
      festivalId: festival.id,
      idempotencyKey: randomUUID(),
    });
    expect(activated.success).toBe(true);

    await createStandHold({
      standId: standIds[0],
      idempotencyKey: randomUUID(),
    });
    const [hold] = await integrationDb!
      .select({ id: standHolds.id })
      .from(standHolds)
      .where(eq(standHolds.festivalId, festival.id));
    const confirmed = await confirmStandHold({
      holdId: hold.id,
      idempotencyKey: randomUUID(),
    });
    expect(confirmed.success).toBe(true);
    const reservationId = (confirmed as { data: { reservationId: number } })
      .data.reservationId;

    // The hold was captured, so the credits are spent and the balance is zero.
    expect((await readCreditBalances(user.id)).ledgerBalance).toBe(0);

    const rejected = await reviewCreditTopUp({
      topUpId,
      reviewerUserId: user.id,
      decision: "rejected",
      rejectionReason: "El comprobante no corresponde.",
    });
    expect(rejected.ok).toBe(true);

    // The reversal takes back credits that were already spent, so the account
    // goes into debt. What the credits bought is deliberately untouched: PRD
    // §17 rewinds the money, never the reservation.
    expect((await readCreditBalances(user.id)).ledgerBalance).toBe(
      -ACCESS_PRICE,
    );

    const [reservation] = await integrationDb!
      .select({ id: standReservations.id, status: standReservations.status })
      .from(standReservations)
      .where(eq(standReservations.id, reservationId));
    expect(reservation).toMatchObject({ status: "pending" });

    const members = await integrationDb!
      .select({ standId: standReservationStands.standId })
      .from(standReservationStands)
      .where(eq(standReservationStands.reservationId, reservationId));
    expect(members).toHaveLength(2);

    // And the way back out is self-service: a debt purchase for exactly what
    // is owed, and nothing more.
    const debtPurchase = await createDebtCreditTopUp({
      idempotencyKey: randomUUID(),
    });
    expect(debtPurchase).toMatchObject({
      success: true,
      data: { amount: ACCESS_PRICE },
    });

    const debtRows = await integrationDb!
      .select({
        intendedUseType: creditTopUps.intendedUseType,
        intendedUseId: creditTopUps.intendedUseId,
        amount: creditTopUps.amount,
      })
      .from(creditTopUps)
      .where(
        and(
          eq(creditTopUps.userId, user.id),
          eq(creditTopUps.intendedUseType, "debt"),
        ),
      );
    expect(debtRows).toEqual([
      { intendedUseType: "debt", intendedUseId: null, amount: ACCESS_PRICE },
    ]);

    // The one credit email there is. Buying is synchronous and the wallet
    // reports it on the spot, so only the rejection is worth telling somebody
    // about — and it is the only one that can leave them owing money.
    const queued = await integrationDb!
      .select({
        kind: reservationNotificationJobs.notificationKind,
        recipientEmail: reservationNotificationJobs.recipientEmail,
        payload: reservationNotificationJobs.payload,
        deduplicationKey: reservationNotificationJobs.deduplicationKey,
      })
      .from(reservationNotificationJobs)
      .where(eq(reservationNotificationJobs.userId, user.id));
    expect(queued).toEqual([
      {
        kind: "credit_top_up_rejected",
        recipientEmail: user.email,
        // The debt as of the rejection, so a later waiver cannot rewrite what
        // the participant was told.
        payload: { topUpId, debtAmount: ACCESS_PRICE },
        // Keyed on the top-up: credit jobs carry no reservation, so the
        // outbox's default key would collide across every purchase this
        // person ever has rejected.
        deduplicationKey: `credit_top_up_rejected:${topUpId}`,
      },
    ]);

    // Reviewing again replays the same answer without reversing twice or
    // telling them twice.
    const replayed = await reviewCreditTopUp({
      topUpId,
      reviewerUserId: user.id,
      decision: "rejected",
      rejectionReason: "El comprobante no corresponde.",
    });
    expect(replayed).toMatchObject({ ok: true, data: { jobIds: [] } });
    expect((await readCreditBalances(user.id)).ledgerBalance).toBe(
      -ACCESS_PRICE,
    );

    const afterReplay = await integrationDb!
      .select({ id: reservationNotificationJobs.id })
      .from(reservationNotificationJobs)
      .where(eq(reservationNotificationJobs.userId, user.id));
    expect(afterReplay).toHaveLength(1);
  });

  /**
   * Approval grants no new spending power — the credits were already
   * spendable — so there is nothing to announce.
   */
  it("says nothing to the participant when a voucher is approved", async () => {
    const { festival, user } = await seed({ credits: 0 });

    const purchase = await createFeatureCreditTopUp({
      festivalId: festival.id,
      featureType: "full_table",
      idempotencyKey: randomUUID(),
    });
    const topUpId = (purchase as { data: { topUpId: number } }).data.topUpId;
    await submitCreditTopUpVoucher({
      topUpId,
      userId: user.id,
      voucherUrl: "https://example.test/v.png",
      fileKey: `v-${topUpId}`,
    });

    const approved = await reviewCreditTopUp({
      topUpId,
      reviewerUserId: user.id,
      decision: "approved",
    });
    expect(approved).toMatchObject({ ok: true, data: { jobIds: [] } });

    const queued = await integrationDb!
      .select({ id: reservationNotificationJobs.id })
      .from(reservationNotificationJobs)
      .where(eq(reservationNotificationJobs.userId, user.id));
    expect(queued).toEqual([]);
  });

  /**
   * Credits are usable the moment their voucher is submitted, on anything.
   * There used to be a confirmed-only tier that let provisional credit activate
   * a feature but not pay a reservation; a bad voucher is now recovered
   * afterwards through debt rather than withheld beforehand.
   */
  it("lets a purchase under review pay a reservation invoice", async () => {
    const { festival, user } = await seed({ credits: 0 });

    const purchase = await createFeatureCreditTopUp({
      festivalId: festival.id,
      featureType: "full_table",
      idempotencyKey: randomUUID(),
    });
    const topUpId = (purchase as { data: { topUpId: number } }).data.topUpId;
    await submitCreditTopUpVoucher({
      topUpId,
      userId: user.id,
      voucherUrl: "https://example.test/v.png",
      fileKey: `v-${topUpId}`,
    });

    // Submitted, not yet reviewed.
    const [row] = await integrationDb!
      .select({ status: creditTopUps.status })
      .from(creditTopUps)
      .where(eq(creditTopUps.id, topUpId));
    expect(row.status).toBe("under_review");

    const balances = await readCreditBalances(user.id);
    expect(balances.underReviewIssuance).toBe(ACCESS_PRICE);
    // Spendable in full, with the under-review portion reported rather than
    // deducted.
    expect(balances.spendableBalance).toBe(ACCESS_PRICE);
    expect(canFundInvoiceCreditAllocation(balances, ACCESS_PRICE)).toBe(true);
  });

  it("refuses a debt purchase when nothing is owed", async () => {
    await seed({ credits: 10 });

    const result = await createDebtCreditTopUp({
      idempotencyKey: randomUUID(),
    });

    expect(result).toMatchObject({
      success: false,
      code: "CREDIT_TOP_UP_NOT_NEEDED",
    });
  });
});
