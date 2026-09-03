// @vitest-environment node

import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "crypto";
import { desc, eq, inArray } from "drizzle-orm";
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
  festivalTermsDocuments,
  festivalTermsVersions,
  festivals,
  invoiceSettlementSubmissions,
  invoices,
  payments,
  reservationExternalParticipants,
  reservationNotificationJobs,
  reservationParticipants,
  reservationRequestRegistry,
  scheduledTasks,
  standHolds,
  standReservationEvents,
  standReservations,
  stands,
  storageCleanupJobs,
  userRequests,
  users,
  externalParticipants,
} from "@/db/schema";

const currentProfileMock = vi.hoisted(() => vi.fn());
const actorAls = new AsyncLocalStorage<{
  id: number;
  role: string;
  status: string;
}>();

vi.mock("server-only", () => ({}));
vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: currentProfileMock,
  requireAdmin: async () => {
    const profile = await currentProfileMock();
    if (!profile || profile.role !== "admin") return null;
    return profile;
  },
  requireAdminOrFestivalAdmin: async () => {
    const profile = await currentProfileMock();
    if (
      !profile ||
      (profile.role !== "admin" && profile.role !== "festival_admin")
    ) {
      return null;
    }
    return profile;
  },
}));
vi.mock("@/app/lib/reservations/notification-outbox", () => ({
  enqueueAdminAndOwnerNotifications: vi.fn().mockResolvedValue([]),
  enqueueReservationNotification: vi.fn().mockResolvedValue(null),
  scheduleReservationNotificationJobs: vi.fn(),
}));
vi.mock("@/app/lib/uploadthing/actions", () => ({
  enqueueStorageCleanupJob: vi.fn(),
}));
vi.mock("@/app/api/users/actions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/api/users/actions")>();
  return {
    ...actual,
    fetchAdminUsers: vi.fn().mockResolvedValue([]),
  };
});
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

currentProfileMock.mockImplementation(async () => actorAls.getStore() ?? null);

function withActor<T>(
  actor: { id: number; role: string; status?: string },
  fn: () => Promise<T>,
) {
  return actorAls.run(
    { id: actor.id, role: actor.role, status: actor.status ?? "verified" },
    fn,
  );
}

async function withDeadlockTimeout<T>(promise: Promise<T>, ms = 15_000) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`deadlock timeout after ${ms}ms`)),
      ms,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

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
  ? new Pool({ connectionString: testDatabaseUrl, max: 8 })
  : null;
const integrationDb = pool ? drizzle(pool, { schema }) : null;
const describeDatabase = integrationDb ? describe : describe.skip;

type Fixture = {
  festivalId: number;
  standIds: number[];
  userIds: number[];
  requestIds: number[];
  requestKeys: string[];
  reservationIds: number[];
  invoiceIds: number[];
};

const fixtures: Fixture[] = [];

let createStandHold: (typeof import("@/app/lib/reservations/hold-service"))["createStandHold"];
let cancelStandHold: (typeof import("@/app/lib/reservations/hold-service"))["cancelStandHold"];
let confirmStandHold: (typeof import("@/app/lib/reservations/hold-service"))["confirmStandHold"];
let cleanupExpiredHolds: (typeof import("@/app/lib/reservations/hold-service"))["cleanupExpiredHolds"];
let extendReservationPaymentDeadline: (typeof import("@/app/lib/reservations/admin-service"))["extendReservationPaymentDeadline"];
let updateReservationPartner: (typeof import("@/app/lib/reservations/admin-service"))["updateReservationPartner"];
let cancelReservation: (typeof import("@/app/lib/reservations/admin-service"))["cancelReservation"];
let createAdminReservation: (typeof import("@/app/lib/reservations/admin-actions"))["createAdminReservation"];
let submitPaymentProof: (typeof import("@/app/lib/reservations/payment-service"))["submitPaymentProof"];
let approveInvoiceSettlement: (typeof import("@/app/lib/reservations/payment-service"))["approveInvoiceSettlement"];
let rejectInvoiceSettlement: (typeof import("@/app/lib/reservations/payment-service"))["rejectInvoiceSettlement"];
let correctSettlementProof: (typeof import("@/app/lib/reservations/payment-service"))["correctSettlementProof"];
let reviewFestivalParticipationRequest: (typeof import("@/app/lib/user_requests/review-service"))["reviewFestivalParticipationRequest"];
let createExternalParticipantReservation: (typeof import("@/app/lib/reservations/capacity-service"))["createExternalParticipantReservation"];
let publishedTermsVersionId: number;

describeDatabase("paid-reservation PRD unblocker races", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl!;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";

    ({
      createStandHold,
      cancelStandHold,
      confirmStandHold,
      cleanupExpiredHolds,
    } = await import("@/app/lib/reservations/hold-service"));
    ({
      extendReservationPaymentDeadline,
      updateReservationPartner,
      cancelReservation,
    } = await import("@/app/lib/reservations/admin-service"));
    ({ createAdminReservation } = await import(
      "@/app/lib/reservations/admin-actions"
    ));
    ({
      submitPaymentProof,
      approveInvoiceSettlement,
      rejectInvoiceSettlement,
      correctSettlementProof,
    } = await import("@/app/lib/reservations/payment-service"));
    ({ reviewFestivalParticipationRequest } = await import(
      "@/app/lib/user_requests/review-service"
    ));
    ({ createExternalParticipantReservation } = await import(
      "@/app/lib/reservations/capacity-service"
    ));

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
    const db = integrationDb!;
    const leftover = fixtures.splice(0);
    for (const fixture of leftover) {
      if (fixture.requestKeys.length > 0) {
        await db
          .delete(reservationRequestRegistry)
          .where(
            inArray(reservationRequestRegistry.requestKey, fixture.requestKeys),
          );
      }
      if (fixture.invoiceIds.length > 0) {
        await db
          .delete(storageCleanupJobs)
          .where(inArray(storageCleanupJobs.entityId, fixture.invoiceIds));
        await db
          .delete(invoiceSettlementSubmissions)
          .where(
            inArray(invoiceSettlementSubmissions.invoiceId, fixture.invoiceIds),
          );
        await db
          .delete(payments)
          .where(inArray(payments.invoiceId, fixture.invoiceIds));
        await db.delete(invoices).where(inArray(invoices.id, fixture.invoiceIds));
      }
      if (fixture.reservationIds.length > 0) {
        await db
          .delete(scheduledTasks)
          .where(inArray(scheduledTasks.reservationId, fixture.reservationIds));
        await db
          .delete(standReservationEvents)
          .where(
            inArray(standReservationEvents.reservationId, fixture.reservationIds),
          );
        await db
          .delete(reservationExternalParticipants)
          .where(
            inArray(
              reservationExternalParticipants.reservationId,
              fixture.reservationIds,
            ),
          );
        await db
          .delete(reservationParticipants)
          .where(
            inArray(reservationParticipants.reservationId, fixture.reservationIds),
          );
        await db
          .delete(standReservations)
          .where(inArray(standReservations.id, fixture.reservationIds));
      }
      await db
        .delete(standHolds)
        .where(eq(standHolds.festivalId, fixture.festivalId));
      const leftoverReservations = await db
        .select({ id: standReservations.id })
        .from(standReservations)
        .where(eq(standReservations.festivalId, fixture.festivalId));
      const leftoverIds = leftoverReservations.map((row) => row.id);
      if (leftoverIds.length > 0) {
        const leftoverInvoices = await db
          .select({ id: invoices.id })
          .from(invoices)
          .where(inArray(invoices.reservationId, leftoverIds));
        const leftoverInvoiceIds = leftoverInvoices.map((row) => row.id);
        if (leftoverInvoiceIds.length > 0) {
          await db
            .delete(storageCleanupJobs)
            .where(inArray(storageCleanupJobs.entityId, leftoverInvoiceIds));
          await db
            .delete(invoiceSettlementSubmissions)
            .where(
              inArray(
                invoiceSettlementSubmissions.invoiceId,
                leftoverInvoiceIds,
              ),
            );
          await db
            .delete(payments)
            .where(inArray(payments.invoiceId, leftoverInvoiceIds));
          await db
            .delete(invoices)
            .where(inArray(invoices.id, leftoverInvoiceIds));
        }
        await db
          .delete(reservationNotificationJobs)
          .where(inArray(reservationNotificationJobs.reservationId, leftoverIds));
        await db
          .delete(scheduledTasks)
          .where(inArray(scheduledTasks.reservationId, leftoverIds));
        await db
          .delete(standReservationEvents)
          .where(inArray(standReservationEvents.reservationId, leftoverIds));
        await db
          .delete(reservationExternalParticipants)
          .where(
            inArray(reservationExternalParticipants.reservationId, leftoverIds),
          );
        await db
          .delete(reservationParticipants)
          .where(inArray(reservationParticipants.reservationId, leftoverIds));
        await db
          .delete(standReservations)
          .where(inArray(standReservations.id, leftoverIds));
      }
      if (fixture.userIds.length > 0) {
        await db
          .delete(reservationRequestRegistry)
          .where(
            inArray(reservationRequestRegistry.actorUserId, fixture.userIds),
          );
        await db
          .delete(externalParticipants)
          .where(inArray(externalParticipants.createdByUserId, fixture.userIds));
        await db
          .delete(reservationNotificationJobs)
          .where(inArray(reservationNotificationJobs.userId, fixture.userIds));
      }
      for (const standId of fixture.standIds) {
        await db.delete(stands).where(eq(stands.id, standId));
      }
      for (const requestId of fixture.requestIds) {
        await db.delete(userRequests).where(eq(userRequests.id, requestId));
      }
      for (const userId of fixture.userIds) {
        await db.delete(users).where(eq(users.id, userId));
      }
      await db.delete(festivals).where(eq(festivals.id, fixture.festivalId));
    }
  });

  afterAll(async () => {
    await pool?.end();
  });

  async function seedFixture(input: {
    userCount: number;
    standCount: number;
    categories?: Array<
      "illustration" | "gastronomy" | "entrepreneurship" | "new_artist"
    >;
    roles?: Array<"user" | "admin" | "artist">;
    enrollmentStatus?: "accepted" | "pending";
  }) {
    const db = integrationDb!;
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const requestKeys: string[] = [];
    const reservationIds: number[] = [];
    const invoiceIds: number[] = [];

    const [festival] = await db
      .insert(festivals)
      .values({
        name: `Unblocker ${suffix}`,
        status: "active",
        festivalType: "glitter",
        participantTermsEnabled: true,
        reservationsStartDate: new Date(Date.now() - 60_000),
      })
      .returning();

    const insertedUsers = await db
      .insert(users)
      .values(
        Array.from({ length: input.userCount }, (_, index) => ({
          clerkId: `unblocker-${suffix}-${index}`,
          email: `unblocker-${suffix}-${index}@example.test`,
          displayName: `Unblocker ${suffix}-${index}`,
          status: "verified" as const,
          category: (input.categories?.[index] ?? "illustration") as
            | "illustration"
            | "gastronomy"
            | "entrepreneurship"
            | "new_artist",
          role: (input.roles?.[index] ?? "user") as "user" | "admin" | "artist",
        })),
      )
      .returning();

    const enrollmentRows = await db
      .insert(userRequests)
      .values(
        insertedUsers.map((user) => ({
          userId: user.id,
          festivalId: festival.id,
          type: "festival_participation" as const,
          status: (input.enrollmentStatus ?? "accepted") as
            | "accepted"
            | "pending",
          termsVersionId: publishedTermsVersionId,
        })),
      )
      .returning();

    const insertedStands = await db
      .insert(stands)
      .values(
        Array.from({ length: input.standCount }, (_, index) => ({
          festivalId: festival.id,
          standNumber: index + 1,
          standCategory: "illustration" as const,
          status: "available" as const,
          price: 100,
          individualPrice: 100,
        })),
      )
      .returning();

    const fixture: Fixture = {
      festivalId: festival.id,
      standIds: insertedStands.map((stand) => stand.id),
      userIds: insertedUsers.map((user) => user.id),
      requestIds: enrollmentRows.map((row) => row.id),
      requestKeys,
      reservationIds,
      invoiceIds,
    };
    fixtures.push(fixture);

    return {
      festival,
      users: insertedUsers,
      stands: insertedStands,
      enrollments: enrollmentRows,
      fixture,
      trackRequestKey(key: string) {
        requestKeys.push(key);
      },
      trackReservation(id: number) {
        reservationIds.push(id);
      },
      trackInvoice(id: number) {
        invoiceIds.push(id);
      },
    };
  }

  async function holdFor(
    actor: { id: number; role: string },
    standId: number,
    trackRequestKey: (key: string) => void,
  ) {
    const key = randomUUID();
    trackRequestKey(key);
    const result = await withActor(actor, () =>
      createStandHold({ standId, idempotencyKey: key }),
    );
    expect(result.success).toBe(true);
    const [hold] = await integrationDb!
      .select()
      .from(standHolds)
      .where(eq(standHolds.standId, standId));
    expect(hold).toBeTruthy();
    return hold;
  }

  async function confirmFor(
    actor: { id: number; role: string },
    holdId: number,
    trackRequestKey: (key: string) => void,
    partnerId?: number,
  ) {
    const key = randomUUID();
    trackRequestKey(key);
    return withActor(actor, () =>
      confirmStandHold({
        holdId,
        partnerId,
        idempotencyKey: key,
      }),
    );
  }

  async function trackReservationRows(
    festivalId: number,
    trackReservation: (id: number) => void,
    trackInvoice: (id: number) => void,
  ) {
    const rows = await integrationDb!
      .select({ id: standReservations.id })
      .from(standReservations)
      .where(eq(standReservations.festivalId, festivalId));
    for (const row of rows) trackReservation(row.id);
    if (rows.length > 0) {
      const invoiceRows = await integrationDb!
        .select({ id: invoices.id })
        .from(invoices)
        .where(
          inArray(
            invoices.reservationId,
            rows.map((row) => row.id),
          ),
        );
      for (const invoice of invoiceRows) trackInvoice(invoice.id);
    }
    return rows;
  }

  it("serializes hold cancellation versus confirmation without deadlock", async () => {
    const {
      users: [owner],
      stands: [stand],
      festival,
      trackRequestKey,
      trackReservation,
      trackInvoice,
    } = await seedFixture({ userCount: 1, standCount: 1 });
    const hold = await holdFor(owner, stand.id, trackRequestKey);

    const [cancelResult, confirmResult] = await withDeadlockTimeout(
      Promise.all([
        withActor(owner, () => cancelStandHold({ holdId: hold.id })),
        confirmFor(owner, hold.id, trackRequestKey),
      ]),
    );

    await trackReservationRows(festival.id, trackReservation, trackInvoice);
    const remainingHolds = await integrationDb!.query.standHolds.findMany({
      where: eq(standHolds.standId, stand.id),
    });
    const liveReservations = await integrationDb!
      .select()
      .from(standReservations)
      .where(eq(standReservations.standId, stand.id));
    const [standRow] = await integrationDb!
      .select({ status: stands.status })
      .from(stands)
      .where(eq(stands.id, stand.id));

    expect([cancelResult.success, confirmResult.success]).toContain(true);
    expect(remainingHolds.length + liveReservations.filter((row) => row.status !== "rejected").length).toBeLessThanOrEqual(1);
    if (liveReservations.some((row) => row.status !== "rejected")) {
      expect(standRow?.status).toBe("reserved");
      expect(remainingHolds).toHaveLength(0);
    } else {
      expect(remainingHolds).toHaveLength(0);
      expect(standRow?.status).toBe("available");
    }
  }, 20_000);

  it("does not release an occupied stand when cancel races cleanup or replacement", async () => {
    const {
      users: [owner],
      stands: [standA, standB],
      trackRequestKey,
    } = await seedFixture({ userCount: 1, standCount: 2 });
    const hold = await holdFor(owner, standA.id, trackRequestKey);
    const replaceKey = randomUUID();
    trackRequestKey(replaceKey);

    await withDeadlockTimeout(
      Promise.all([
        withActor(owner, () => cancelStandHold({ holdId: hold.id })),
        withActor(owner, () =>
          createStandHold({ standId: standB.id, idempotencyKey: replaceKey }),
        ),
        cleanupExpiredHolds(),
      ]),
    );

    const holds = await integrationDb!.query.standHolds.findMany({
      where: eq(standHolds.userId, owner.id),
    });
    expect(holds.length).toBeLessThanOrEqual(1);
    const occupiedStandIds = new Set(holds.map((row) => row.standId));
    const standRows = await integrationDb!
      .select({ id: stands.id, status: stands.status })
      .from(stands)
      .where(inArray(stands.id, [standA.id, standB.id]));
    for (const row of standRows) {
      if (occupiedStandIds.has(row.id)) {
        expect(row.status).toBe("held");
      } else {
        expect(row.status).toBe("available");
      }
    }
  }, 20_000);

  it("extends a deadline concurrently with proof submission without deadlock", async () => {
    const {
      users: [owner, admin],
      stands: [stand],
      festival,
      trackRequestKey,
      trackReservation,
      trackInvoice,
    } = await seedFixture({
      userCount: 2,
      standCount: 1,
      roles: ["user", "admin"],
    });
    const hold = await holdFor(owner, stand.id, trackRequestKey);
    const confirmed = await confirmFor(owner, hold.id, trackRequestKey);
    expect(confirmed.success).toBe(true);
    await trackReservationRows(festival.id, trackReservation, trackInvoice);
    const [invoice] = await integrationDb!
      .select()
      .from(invoices)
      .where(eq(invoices.userId, owner.id));
    expect(invoice).toBeTruthy();
    trackInvoice(invoice.id);

    const dueAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const proofKey = randomUUID();
    trackRequestKey(proofKey);

    await withDeadlockTimeout(
      Promise.all([
        withActor(admin, () =>
          extendReservationPaymentDeadline({
            reservationId: invoice.reservationId,
            dueAt,
          }),
        ),
        withActor(owner, () =>
          submitPaymentProof({
            invoiceId: invoice.id,
            voucherUrl: "https://utfs.io/f/unblocker-proof",
            fileKey: `unblocker-${proofKey}`,
            source: "uploadthing",
            idempotencyKey: proofKey,
          }),
        ),
      ]),
    );

    const [freshInvoice] = await integrationDb!
      .select()
      .from(invoices)
      .where(eq(invoices.id, invoice.id));
    const [task] = await integrationDb!
      .select()
      .from(scheduledTasks)
      .where(eq(scheduledTasks.reservationId, invoice.reservationId));
    const [reservation] = await integrationDb!
      .select()
      .from(standReservations)
      .where(eq(standReservations.id, invoice.reservationId));

    expect(freshInvoice.dueAt?.getTime()).toBe(task?.dueDate.getTime());
    expect(["pending", "verification_payment"]).toContain(freshInvoice.status);
    expect(reservation.status).toBe(freshInvoice.status);
  }, 20_000);

  it("extends a deadline concurrently with approve, reject, or cancel without deadlock", async () => {
    const {
      users: [owner, admin],
      stands: [stand],
      festival,
      trackRequestKey,
      trackReservation,
      trackInvoice,
    } = await seedFixture({
      userCount: 2,
      standCount: 1,
      roles: ["user", "admin"],
    });
    const hold = await holdFor(owner, stand.id, trackRequestKey);
    const confirmed = await confirmFor(owner, hold.id, trackRequestKey);
    expect(confirmed.success).toBe(true);
    await trackReservationRows(festival.id, trackReservation, trackInvoice);
    const [invoice] = await integrationDb!
      .select()
      .from(invoices)
      .where(eq(invoices.userId, owner.id));
    const proofKey = randomUUID();
    trackRequestKey(proofKey);
    const submitted = await withActor(owner, () =>
      submitPaymentProof({
        invoiceId: invoice.id,
        voucherUrl: "https://utfs.io/f/unblocker-proof-2",
        fileKey: `unblocker-${proofKey}`,
        source: "uploadthing",
        idempotencyKey: proofKey,
      }),
    );
    expect(submitted.success).toBe(true);
    const [submission] = await integrationDb!
      .select()
      .from(invoiceSettlementSubmissions)
      .where(eq(invoiceSettlementSubmissions.invoiceId, invoice.id));

    const dueAt = new Date(Date.now() + 12 * 24 * 60 * 60 * 1000);
    const [deadlineResult, approveResult, rejectResult, cancelResult] =
      await withDeadlockTimeout(
        Promise.all([
          withActor(admin, () =>
            extendReservationPaymentDeadline({
              reservationId: invoice.reservationId,
              dueAt,
            }),
          ),
          withActor(admin, () =>
            approveInvoiceSettlement({ submissionId: submission.id }),
          ),
          withActor(admin, () =>
            rejectInvoiceSettlement({
              submissionId: submission.id,
              reason: "no corresponde",
              correction: { type: "keep_amount" },
            }),
          ),
          withActor(admin, () =>
            cancelReservation({ reservationId: invoice.reservationId }),
          ),
        ]),
      );

    expect(
      [deadlineResult, approveResult, rejectResult, cancelResult].every(
        (result) => result != null,
      ),
    ).toBe(true);

    const [reservation] = await integrationDb!
      .select()
      .from(standReservations)
      .where(eq(standReservations.id, invoice.reservationId));
    const [freshInvoice] = await integrationDb!
      .select()
      .from(invoices)
      .where(eq(invoices.id, invoice.id));
    if (reservation.status === "accepted") {
      expect(freshInvoice.status).toBe("paid");
    } else if (reservation.status === "rejected") {
      expect(freshInvoice.status).not.toBe("cancelled");
    } else {
      expect(reservation.status).toBe(freshInvoice.status);
    }
  }, 20_000);

  it("cancels only invoices without payment evidence", async () => {
    const {
      users: [unpaidOwner, paidOwner, admin],
      stands: [unpaidStand, paidStand],
      festival,
      trackRequestKey,
      trackReservation,
      trackInvoice,
    } = await seedFixture({
      userCount: 3,
      standCount: 2,
      roles: ["user", "user", "admin"],
    });

    const unpaidHold = await holdFor(
      unpaidOwner,
      unpaidStand.id,
      trackRequestKey,
    );
    const paidHold = await holdFor(paidOwner, paidStand.id, trackRequestKey);
    expect(
      (await confirmFor(unpaidOwner, unpaidHold.id, trackRequestKey)).success,
    ).toBe(true);
    expect(
      (await confirmFor(paidOwner, paidHold.id, trackRequestKey)).success,
    ).toBe(true);
    await trackReservationRows(festival.id, trackReservation, trackInvoice);

    const reservationRows = await integrationDb!
      .select({
        id: standReservations.id,
        ownerUserId: standReservations.ownerUserId,
      })
      .from(standReservations)
      .where(eq(standReservations.festivalId, festival.id));
    const unpaidReservation = reservationRows.find(
      (row) => row.ownerUserId === unpaidOwner.id,
    )!;
    const paidReservation = reservationRows.find(
      (row) => row.ownerUserId === paidOwner.id,
    )!;
    const [paidInvoice] = await integrationDb!
      .select()
      .from(invoices)
      .where(eq(invoices.reservationId, paidReservation.id));
    const proofKey = randomUUID();
    trackRequestKey(proofKey);
    expect(
      (
        await withActor(paidOwner, () =>
          submitPaymentProof({
            invoiceId: paidInvoice.id,
            voucherUrl: "https://utfs.io/f/cancellation-proof",
            fileKey: `cancellation-${proofKey}`,
            source: "uploadthing",
            idempotencyKey: proofKey,
          }),
        )
      ).success,
    ).toBe(true);

    expect(
      (
        await withActor(admin, () =>
          cancelReservation({ reservationId: unpaidReservation.id }),
        )
      ).success,
    ).toBe(true);
    expect(
      (
        await withActor(admin, () =>
          cancelReservation({ reservationId: paidReservation.id }),
        )
      ).success,
    ).toBe(true);

    const cancelledInvoices = await integrationDb!
      .select({
        reservationId: invoices.reservationId,
        status: invoices.status,
      })
      .from(invoices)
      .where(
        inArray(invoices.reservationId, [
          unpaidReservation.id,
          paidReservation.id,
        ]),
      );
    expect(
      cancelledInvoices.find(
        (invoice) => invoice.reservationId === unpaidReservation.id,
      )?.status,
    ).toBe("cancelled");
    expect(
      cancelledInvoices.find(
        (invoice) => invoice.reservationId === paidReservation.id,
      )?.status,
    ).toBe("verification_payment");
  });

  it("lets settlement rejection explicitly cancel a payment-bearing invoice", async () => {
    const {
      users: [owner, admin],
      stands: [stand],
      festival,
      trackRequestKey,
      trackReservation,
      trackInvoice,
    } = await seedFixture({
      userCount: 2,
      standCount: 1,
      roles: ["user", "admin"],
    });
    const hold = await holdFor(owner, stand.id, trackRequestKey);
    expect((await confirmFor(owner, hold.id, trackRequestKey)).success).toBe(
      true,
    );
    await trackReservationRows(festival.id, trackReservation, trackInvoice);
    const [invoice] = await integrationDb!
      .select()
      .from(invoices)
      .where(eq(invoices.userId, owner.id));
    const proofKey = randomUUID();
    trackRequestKey(proofKey);
    expect(
      (
        await withActor(owner, () =>
          submitPaymentProof({
            invoiceId: invoice.id,
            voucherUrl: "https://utfs.io/f/rejected-cancellation-proof",
            fileKey: `rejected-cancellation-${proofKey}`,
            source: "uploadthing",
            idempotencyKey: proofKey,
          }),
        )
      ).success,
    ).toBe(true);
    const [submission] = await integrationDb!
      .select()
      .from(invoiceSettlementSubmissions)
      .where(eq(invoiceSettlementSubmissions.invoiceId, invoice.id));

    expect(
      (
        await withActor(admin, () =>
          rejectInvoiceSettlement({
            submissionId: submission.id,
            reason: "Comprobante rechazado; cancelar reserva",
            correction: { type: "cancel_reservation" },
          }),
        )
      ).success,
    ).toBe(true);

    const [freshReservation] = await integrationDb!
      .select({ status: standReservations.status })
      .from(standReservations)
      .where(eq(standReservations.id, invoice.reservationId));
    const [freshInvoice] = await integrationDb!
      .select({ status: invoices.status })
      .from(invoices)
      .where(eq(invoices.id, invoice.id));
    const [freshSubmission] = await integrationDb!
      .select({ status: invoiceSettlementSubmissions.status })
      .from(invoiceSettlementSubmissions)
      .where(eq(invoiceSettlementSubmissions.id, submission.id));
    const paymentRows = await integrationDb!
      .select({ id: payments.id })
      .from(payments)
      .where(eq(payments.invoiceId, invoice.id));

    expect(freshReservation.status).toBe("rejected");
    expect(freshInvoice.status).toBe("cancelled");
    expect(freshSubmission.status).toBe("rejected");
    expect(paymentRows).toHaveLength(1);
  });

  it("keeps at most one partner when two edits race on the same reservation", async () => {
    const {
      users: [owner, partnerA, partnerB, admin],
      stands: [stand],
      festival,
      trackRequestKey,
      trackReservation,
      trackInvoice,
    } = await seedFixture({
      userCount: 4,
      standCount: 1,
      roles: ["user", "user", "user", "admin"],
    });
    const hold = await holdFor(owner, stand.id, trackRequestKey);
    const confirmed = await confirmFor(owner, hold.id, trackRequestKey);
    expect(confirmed.success).toBe(true);
    const reservations = await trackReservationRows(
      festival.id,
      trackReservation,
      trackInvoice,
    );
    const reservationId = reservations[0]!.id;

    const [editA, editB] = await withDeadlockTimeout(
      Promise.all([
        withActor(admin, () =>
          updateReservationPartner({
            reservationId,
            partnerUserId: partnerA.id,
          }),
        ),
        withActor(admin, () =>
          updateReservationPartner({
            reservationId,
            partnerUserId: partnerB.id,
          }),
        ),
      ]),
    );

    const participants = await integrationDb!
      .select()
      .from(reservationParticipants)
      .where(eq(reservationParticipants.reservationId, reservationId));
    expect(participants).toHaveLength(2);
    const partnerIds = participants
      .map((row) => row.userId)
      .filter((userId) => userId !== owner.id);
    expect(partnerIds).toHaveLength(1);
    expect([partnerA.id, partnerB.id]).toContain(partnerIds[0]);
    expect([editA.success, editB.success].filter(Boolean).length).toBeGreaterThanOrEqual(1);
  }, 20_000);

  it("allows the same partner on at most one festival reservation", async () => {
    const {
      users: [ownerA, ownerB, partner],
      stands: [standA, standB],
      festival,
      trackRequestKey,
      trackReservation,
      trackInvoice,
    } = await seedFixture({ userCount: 3, standCount: 2 });
    const holdA = await holdFor(ownerA, standA.id, trackRequestKey);
    const holdB = await holdFor(ownerB, standB.id, trackRequestKey);

    await withDeadlockTimeout(
      Promise.all([
        confirmFor(ownerA, holdA.id, trackRequestKey, partner.id),
        confirmFor(ownerB, holdB.id, trackRequestKey, partner.id),
      ]),
    );

    await trackReservationRows(festival.id, trackReservation, trackInvoice);
    const memberships = await integrationDb!
      .select()
      .from(reservationParticipants)
      .where(eq(reservationParticipants.userId, partner.id));
    expect(memberships.length).toBeLessThanOrEqual(1);
  }, 20_000);

  it("rejects a direct confirmation with a non-illustration partner", async () => {
    const {
      users: [owner, partner],
      stands: [stand],
      festival,
      trackRequestKey,
      trackReservation,
      trackInvoice,
    } = await seedFixture({
      userCount: 2,
      standCount: 1,
      categories: ["illustration", "gastronomy"],
    });
    const hold = await holdFor(owner, stand.id, trackRequestKey);
    const result = await confirmFor(
      owner,
      hold.id,
      trackRequestKey,
      partner.id,
    );
    await trackReservationRows(festival.id, trackReservation, trackInvoice);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("PARTNER_NOT_ELIGIBLE");
    }
    const live = await integrationDb!
      .select()
      .from(standReservations)
      .where(eq(standReservations.standId, stand.id));
    expect(live).toHaveLength(0);
    const [holdRow] = await integrationDb!
      .select()
      .from(standHolds)
      .where(eq(standHolds.id, hold.id));
    expect(holdRow).toBeTruthy();
  });

  it("rejects admin create and edit with an ineligible partner", async () => {
    const {
      users: [owner, gastronomyPartner, admin],
      stands: [stand],
      festival,
      trackRequestKey,
      trackReservation,
      trackInvoice,
    } = await seedFixture({
      userCount: 3,
      standCount: 1,
      categories: ["illustration", "gastronomy", "illustration"],
      roles: ["user", "user", "admin"],
    });
    const createKey = randomUUID();
    trackRequestKey(createKey);
    const created = await withActor(admin, () =>
      createAdminReservation({
        festivalId: festival.id,
        standId: stand.id,
        ownerUserId: owner.id,
        partnerId: gastronomyPartner.id,
        idempotencyKey: createKey,
      }),
    );
    expect(created.success).toBe(false);

    const hold = await holdFor(owner, stand.id, trackRequestKey);
    const confirmed = await confirmFor(owner, hold.id, trackRequestKey);
    expect(confirmed.success).toBe(true);
    const reservations = await trackReservationRows(
      festival.id,
      trackReservation,
      trackInvoice,
    );
    const edited = await withActor(admin, () =>
      updateReservationPartner({
        reservationId: reservations[0]!.id,
        partnerUserId: gastronomyPartner.id,
      }),
    );
    expect(edited.success).toBe(false);
    const participants = await integrationDb!
      .select()
      .from(reservationParticipants)
      .where(eq(reservationParticipants.reservationId, reservations[0]!.id));
    expect(participants.map((row) => row.userId)).toEqual([owner.id]);
  });

  it("serializes enrollment rejection versus hold confirmation", async () => {
    const {
      users: [owner, admin],
      stands: [stand],
      enrollments: [enrollment],
      festival,
      trackRequestKey,
      trackReservation,
      trackInvoice,
    } = await seedFixture({
      userCount: 2,
      standCount: 1,
      roles: ["user", "admin"],
      enrollmentStatus: "pending",
    });

    const [hold] = await integrationDb!
      .insert(standHolds)
      .values({
        standId: stand.id,
        userId: owner.id,
        festivalId: festival.id,
        expiresAt: new Date(Date.now() + 5 * 60_000),
      })
      .returning();
    await integrationDb!
      .update(stands)
      .set({ status: "held" })
      .where(eq(stands.id, stand.id));

    const [reviewResult, confirmResult] = await withDeadlockTimeout(
      Promise.all([
        withActor(admin, () =>
          reviewFestivalParticipationRequest({
            requestId: enrollment.id,
            status: "rejected",
            reason: "fuera de convocatoria",
          }),
        ),
        confirmFor(owner, hold.id, trackRequestKey),
      ]),
    );

    await trackReservationRows(festival.id, trackReservation, trackInvoice);
    expect(reviewResult.success).toBe(true);
    const [request] = await integrationDb!
      .select({ status: userRequests.status })
      .from(userRequests)
      .where(eq(userRequests.id, enrollment.id));
    expect(request.status).toBe("rejected");
    expect(confirmResult.success).toBe(false);
    const live = await integrationDb!
      .select()
      .from(standReservations)
      .where(eq(standReservations.standId, stand.id));
    expect(live).toHaveLength(0);
  }, 20_000);

  it("lets exactly one of proof removal and approval win", async () => {
    const {
      users: [owner, admin],
      stands: [stand],
      festival,
      trackRequestKey,
      trackReservation,
      trackInvoice,
    } = await seedFixture({
      userCount: 2,
      standCount: 1,
      roles: ["user", "admin"],
    });
    const hold = await holdFor(owner, stand.id, trackRequestKey);
    expect((await confirmFor(owner, hold.id, trackRequestKey)).success).toBe(
      true,
    );
    await trackReservationRows(festival.id, trackReservation, trackInvoice);
    const [invoice] = await integrationDb!
      .select()
      .from(invoices)
      .where(eq(invoices.userId, owner.id));
    const proofKey = randomUUID();
    trackRequestKey(proofKey);
    expect(
      (
        await withActor(owner, () =>
          submitPaymentProof({
            invoiceId: invoice.id,
            voucherUrl: "https://utfs.io/f/unblocker-proof-3",
            fileKey: `unblocker-${proofKey}`,
            source: "uploadthing",
            idempotencyKey: proofKey,
          }),
        )
      ).success,
    ).toBe(true);
    const [submission] = await integrationDb!
      .select()
      .from(invoiceSettlementSubmissions)
      .where(eq(invoiceSettlementSubmissions.invoiceId, invoice.id));

    const correctionKey = randomUUID();
    trackRequestKey(correctionKey);
    const reuploadKey = randomUUID();
    trackRequestKey(reuploadKey);
    const [approveResult, correctResult, reuploadResult] =
      await withDeadlockTimeout(
        Promise.all([
          withActor(admin, () =>
            approveInvoiceSettlement({ submissionId: submission.id }),
          ),
          withActor(admin, () =>
            correctSettlementProof({
              invoiceId: invoice.id,
              reason: "archivo ilegible",
              idempotencyKey: correctionKey,
            }),
          ),
          withActor(owner, () =>
            submitPaymentProof({
              invoiceId: invoice.id,
              voucherUrl: "https://utfs.io/f/unblocker-proof-4",
              fileKey: `unblocker-${reuploadKey}`,
              source: "uploadthing",
              idempotencyKey: reuploadKey,
            }),
          ),
        ]),
      );

    expect([approveResult, correctResult, reuploadResult].every(Boolean)).toBe(
      true,
    );
    const [reservation] = await integrationDb!
      .select()
      .from(standReservations)
      .where(eq(standReservations.id, invoice.reservationId));
    const [freshInvoice] = await integrationDb!
      .select()
      .from(invoices)
      .where(eq(invoices.id, invoice.id));
    const paymentRows = await integrationDb!
      .select()
      .from(payments)
      .where(eq(payments.invoiceId, invoice.id));
    expect(paymentRows.length).toBeGreaterThan(0);
    expect([
      ["accepted", "paid"],
      ["pending", "pending"],
      ["pending", "verification_payment"],
      ["verification_payment", "verification_payment"],
    ]).toContainEqual([reservation.status, freshInvoice.status]);
    const submitted = await integrationDb!
      .select()
      .from(invoiceSettlementSubmissions)
      .where(eq(invoiceSettlementSubmissions.invoiceId, invoice.id));
    const submittedOpen = submitted.filter((row) => row.status === "submitted");
    expect(submittedOpen.length).toBeLessThanOrEqual(1);
    if (reservation.status === "accepted") {
      expect(freshInvoice.status).toBe("paid");
      expect(submittedOpen).toHaveLength(0);
      expect(approveResult.success).toBe(true);
    } else {
      expect(["pending", "verification_payment"]).toContain(
        reservation.status,
      );
      expect(["pending", "verification_payment"]).toContain(freshInvoice.status);
    }
  }, 20_000);

  it("lets only one of external assignment and self-service occupancy win", async () => {
    const {
      users: [owner, admin],
      stands: [stand],
      festival,
      trackRequestKey,
      trackReservation,
      trackInvoice,
    } = await seedFixture({
      userCount: 2,
      standCount: 1,
      roles: ["user", "admin"],
    });
    const holdKey = randomUUID();
    const externalKey = randomUUID();
    trackRequestKey(holdKey);
    trackRequestKey(externalKey);

    const [holdResult, externalResult] = await withDeadlockTimeout(
      Promise.all([
        withActor(owner, () =>
          createStandHold({ standId: stand.id, idempotencyKey: holdKey }),
        ),
        withActor(admin, () =>
          createExternalParticipantReservation({
            festivalId: festival.id,
            standId: stand.id,
            idempotencyKey: externalKey,
            externalParticipant: {
              displayName: "Marca Invitada",
              type: "invited_brand",
            },
          }),
        ),
      ]),
    );

    await trackReservationRows(festival.id, trackReservation, trackInvoice);
    const holds = await integrationDb!.query.standHolds.findMany({
      where: eq(standHolds.standId, stand.id),
    });
    const liveReservations = await integrationDb!
      .select()
      .from(standReservations)
      .where(eq(standReservations.standId, stand.id));
    const live = liveReservations.filter((row) => row.status !== "rejected");
    expect(holds.length === 0 || live.length === 0).toBe(true);
    expect(holds.length + live.length).toBe(1);
    expect([holdResult.success, externalResult.success]).toContain(true);
    const [standRow] = await integrationDb!
      .select({ status: stands.status })
      .from(stands)
      .where(eq(stands.id, stand.id));
    if (live.length === 1) {
      expect(standRow?.status).toBe("confirmed");
    } else {
      expect(standRow?.status).toBe("held");
    }
  }, 20_000);
});
