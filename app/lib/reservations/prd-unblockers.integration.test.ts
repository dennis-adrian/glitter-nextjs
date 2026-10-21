// @vitest-environment node

import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "crypto";
import { asc, desc, eq, inArray } from "drizzle-orm";
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
  type MockInstance,
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
  notifications,
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
// The admins the outbox emails. Empty unless a test names its own fixture
// admins: the real query would return every admin in the shared database.
const fetchAdminUsersMock = vi.hoisted(() => vi.fn());
// Queuing runs for real, inbox copy included; sending never does. Scheduling
// is the only way a flow reaches delivery (through next/server `after()`), so
// it is stubbed, and Resend is mocked in case anything gets past that.
const scheduleJobsMock = vi.hoisted(() => vi.fn());
const sendEmailMock = vi.hoisted(() => vi.fn());
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
// Partial: the real enqueue writes reservation_notification_jobs and, through
// phase 2 of docs/PRD-in-app-notifications.md, their inbox copies in the same
// transaction. Only scheduling the send is stubbed.
vi.mock(
  "@/app/lib/reservations/notification-outbox",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@/app/lib/reservations/notification-outbox")
    >()),
    scheduleReservationNotificationJobs: scheduleJobsMock,
  }),
);
vi.mock("@/app/vendors/resend", () => ({ sendEmail: sendEmailMock }));
vi.mock("@/app/lib/uploadthing/storage", () => ({
  enqueueStorageCleanupJob: vi.fn(),
}));
vi.mock("@/app/lib/users/queries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/lib/users/queries")>();
  return {
    ...actual,
    fetchAdminUsers: fetchAdminUsersMock,
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
let notificationOpensDetail: (typeof import("@/app/lib/notifications/registry"))["notificationOpensDetail"];
let publishedTermsVersionId: number;
let consoleErrorSpy: MockInstance<typeof console.error>;

/**
 * The line `mirrorReservationNotificationJobs` logs when it swallows a failed
 * inbox copy. The flow still succeeds, so without this check a broken mirror
 * would only show up as a missing row some assertions never look for.
 */
function isInboxCopyFailure(args: unknown[]) {
  return (
    typeof args[0] === "string" &&
    args[0].includes("[notifications] Inbox copy")
  );
}

/**
 * The inbox kind a participant's job is mirrored as, by outbox kind; null
 * where the email gets no inbox copy.
 */
const PARTICIPANT_INBOX_KIND: Record<string, string | null> = {
  // Only admins are told; the owner is on the screen that made it.
  reservation_created: null,
  proof_submitted: "reservation_proof_submitted",
  zero_value_review_requested: "reservation_zero_value_review_requested",
  settlement_approved: "reservation_confirmed",
  // Its email is never sent while the reservation is still pending.
  settlement_rejected: null,
  reservation_rejected: "reservation_cancelled",
  deadline_extended: "reservation_payment_deadline_extended",
  reservation_released: "reservation_released",
  late_partner_added: "reservation_partner_added",
  festival_participation_approved: "festival_participation_approved",
  festival_participation_rejected: "festival_participation_rejected",
  credit_top_up_rejected: "credit_top_up_rejected",
};

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
    ({ notificationOpensDetail } =
      await import("@/app/lib/notifications/registry"));

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

  beforeEach(() => {
    // Calls through, so unrelated errors (a race's CONFLICT_RETRY) still
    // print; only a swallowed inbox copy fails the test.
    consoleErrorSpy = vi.spyOn(console, "error");
    fetchAdminUsersMock.mockReset();
    fetchAdminUsersMock.mockResolvedValue([]);
    scheduleJobsMock.mockClear();
    sendEmailMock.mockClear();
  });

  afterEach(async () => {
    const inboxCopyFailures =
      consoleErrorSpy.mock.calls.filter(isInboxCopyFailure);
    consoleErrorSpy.mockRestore();

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
        // Before the reservations: the foreign key would only null these out,
        // leaving behind any job whose recipient is not a fixture user.
        await db
          .delete(reservationNotificationJobs)
          .where(
            inArray(
              reservationNotificationJobs.reservationId,
              fixture.reservationIds,
            ),
          );
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
      // Their inbox items go with them (notifications cascade on the user).
      for (const userId of fixture.userIds) {
        await db.delete(users).where(eq(users.id, userId));
      }
      await db.delete(festivals).where(eq(festivals.id, fixture.festivalId));
    }

    expect(inboxCopyFailures).toEqual([]);
    expect(sendEmailMock).not.toHaveBeenCalled();
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

  /** Who `fetchAdminUsers` returns, so the outbox emails (and mirrors) them. */
  function adminsAre(...admins: Array<{ id: number; email: string }>) {
    fetchAdminUsersMock.mockResolvedValue(
      admins.map(({ id, email }) => ({ id, email })),
    );
  }

  async function jobsFor(userId: number) {
    return integrationDb!
      .select()
      .from(reservationNotificationJobs)
      .where(eq(reservationNotificationJobs.userId, userId))
      .orderBy(asc(reservationNotificationJobs.id));
  }

  async function inboxFor(userId: number) {
    return integrationDb!
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(asc(notifications.id));
  }

  /** Each queued email's inbox copy is keyed by its job. */
  function jobDedupeKey(jobId: number) {
    return `reservation-job:${jobId}`;
  }

  function lastScheduledJobIds() {
    const lastCall = scheduleJobsMock.mock.lastCall as
      | [readonly number[]]
      | undefined;
    return [...(lastCall?.[0] ?? [])].sort((a, b) => a - b);
  }

  function sortedIds(...ids: number[]) {
    return [...ids].sort((a, b) => a - b);
  }

  function standLabelOf(stand: { label: string | null; standNumber: number }) {
    return `${stand.label ?? ""}${stand.standNumber}`;
  }

  function reservationPath(
    profileId: number,
    festivalId: number,
    reservationId: number,
  ) {
    return `/profiles/${profileId}/festivals/${festivalId}/reservations/${reservationId}`;
  }

  function dataOf(row: { data: Record<string, unknown> }) {
    return row.data as { reservationId?: number } & Record<string, unknown>;
  }

  /**
   * A participant's inbox mirrors their queued emails one to one: an item per
   * job of a mirrored kind, keyed by that job, and nothing else. Jobs and
   * their copies commit together, so this holds whichever side of a race won.
   */
  async function expectParticipantInboxMirrorsJobs(userId: number) {
    const jobs = await jobsFor(userId);
    const expected = jobs.flatMap((job) => {
      const kind = PARTICIPANT_INBOX_KIND[job.notificationKind];
      if (kind === undefined) {
        throw new Error(`Unmapped outbox kind ${job.notificationKind}`);
      }
      return kind ? [{ dedupeKey: jobDedupeKey(job.id), kind }] : [];
    });
    const inbox = await inboxFor(userId);
    const byKey = (a: { dedupeKey: string }, b: { dedupeKey: string }) =>
      a.dedupeKey.localeCompare(b.dedupeKey);
    expect(
      inbox
        .map((row) => ({ dedupeKey: row.dedupeKey, kind: row.kind }))
        .sort(byKey),
    ).toEqual(expected.sort(byKey));
    return { jobs, inbox };
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
    // A new reservation is only ever announced to admins.
    const { inbox } = await expectParticipantInboxMirrorsJobs(owner.id);
    expect(inbox).toEqual([]);
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

    // Whichever won, the inbox says exactly what committed.
    const { inbox } = await expectParticipantInboxMirrorsJobs(owner.id);
    const extended = inbox.filter(
      (row) => row.kind === "reservation_payment_deadline_extended",
    );
    if (freshInvoice.dueAt?.getTime() === dueAt.getTime()) {
      expect(extended).toHaveLength(1);
      expect(dataOf(extended[0]!)).toMatchObject({
        reservationId: invoice.reservationId,
        role: "owner",
        dueAt: dueAt.toISOString(),
      });
    } else {
      expect(extended).toEqual([]);
    }
    const proofItems = inbox.filter(
      (row) => row.kind === "reservation_proof_submitted",
    );
    expect(proofItems).toHaveLength(
      freshInvoice.status === "verification_payment" ? 1 : 0,
    );
    expect(await inboxFor(admin.id)).toEqual([]);
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

    // Every committed email has its copy and no rolled-back one does; a
    // settlement rejection, if it won, has none.
    const { inbox } = await expectParticipantInboxMirrorsJobs(owner.id);
    const kinds = inbox.map((row) => row.kind);
    expect(
      kinds.filter((kind) => kind === "reservation_proof_submitted"),
    ).toHaveLength(1);
    if (reservation.status === "accepted") {
      expect(kinds).toContain("reservation_confirmed");
    }
    if (reservation.status === "rejected") {
      const cancelled = inbox.find(
        (row) => row.kind === "reservation_cancelled",
      );
      expect(cancelled).toBeDefined();
      // No reason was given, so there is none to open.
      expect(dataOf(cancelled!).reason).toBeNull();
    }
    // The acting admin is not a participant and no admin was emailed.
    expect(await inboxFor(admin.id)).toEqual([]);
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

    for (const [participant, reservationId, expectedKinds] of [
      [unpaidOwner, unpaidReservation.id, ["reservation_cancelled"]],
      [
        paidOwner,
        paidReservation.id,
        ["reservation_proof_submitted", "reservation_cancelled"],
      ],
    ] as const) {
      const { inbox } = await expectParticipantInboxMirrorsJobs(participant.id);
      expect(inbox.map((row) => row.kind)).toEqual(expectedKinds);
      const cancelled = inbox.at(-1)!;
      expect(cancelled).toMatchObject({
        category: "reservations",
        title: "Tu reserva fue cancelada",
        actionPath: reservationPath(participant.id, festival.id, reservationId),
        readAt: null,
      });
      // Cancelled without a reason: nothing to read on its own page.
      expect(dataOf(cancelled)).toMatchObject({
        reservationId,
        profileId: participant.id,
        reason: null,
      });
      expect(cancelled.body).not.toContain("Motivo:");
      expect(notificationOpensDetail(cancelled.kind, cancelled.data)).toBe(
        false,
      );
    }
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

    // Cancelling replaces the settlement_rejected email, so the owner hears
    // about the cancellation, with the reason the admin typed.
    const { jobs, inbox } = await expectParticipantInboxMirrorsJobs(owner.id);
    expect(jobs.map((job) => job.notificationKind)).toEqual([
      "proof_submitted",
      "reservation_rejected",
    ]);
    expect(lastScheduledJobIds()).toEqual([jobs[1]!.id]);
    expect(inbox.map((row) => row.kind)).toEqual([
      "reservation_proof_submitted",
      "reservation_cancelled",
    ]);
    const cancelled = inbox[1]!;
    expect(dataOf(cancelled)).toMatchObject({
      reservationId: invoice.reservationId,
      profileId: owner.id,
      reason: "Comprobante rechazado; cancelar reserva",
    });
    expect(cancelled.body).toMatch(
      /\n\nMotivo: Comprobante rechazado; cancelar reserva$/,
    );
    expect(notificationOpensDetail(cancelled.kind, cancelled.data)).toBe(true);
    expect(await inboxFor(admin.id)).toEqual([]);
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

    const { inbox } = await expectParticipantInboxMirrorsJobs(owner.id);
    expect(inbox.map((row) => row.kind)).toEqual([
      "festival_participation_rejected",
    ]);
    expect(inbox[0]!.data).toEqual({
      festivalId: festival.id,
      festivalName: festival.name,
      reason: "fuera de convocatoria",
    });
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

    // A correction (settlement_rejected) gets no inbox copy, and a re-upload
    // for the same reservation is deduplicated by the outbox, email and item.
    const { jobs, inbox } = await expectParticipantInboxMirrorsJobs(owner.id);
    expect(
      jobs.filter((job) => job.notificationKind === "proof_submitted"),
    ).toHaveLength(1);
    const kinds = inbox.map((row) => row.kind);
    expect(
      kinds.filter((kind) => kind === "reservation_proof_submitted"),
    ).toHaveLength(1);
    if (reservation.status === "accepted") {
      expect(kinds).toContain("reservation_confirmed");
    } else {
      expect(kinds).not.toContain("reservation_confirmed");
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

  // Phase 2 of docs/PRD-in-app-notifications.md: each email the flows above
  // queue lands in its recipient's inbox, written in the same transaction.

  it("mirrors a reservation, its proof and its approval into the payer's and an admin's inbox", async () => {
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
    adminsAre(admin);

    const hold = await holdFor(owner, stand.id, trackRequestKey);
    expect((await confirmFor(owner, hold.id, trackRequestKey)).success).toBe(
      true,
    );
    await trackReservationRows(festival.id, trackReservation, trackInvoice);
    const [invoice] = await integrationDb!
      .select()
      .from(invoices)
      .where(eq(invoices.userId, owner.id));
    const reservationId = invoice.reservationId;
    const reservationRef = {
      reservationId,
      festivalId: festival.id,
      festivalName: festival.name,
      standLabel: standLabelOf(stand),
      standCount: 1,
    };

    // A new reservation is announced to admins only: the owner made it.
    expect(await jobsFor(owner.id)).toEqual([]);
    expect(await inboxFor(owner.id)).toEqual([]);
    const [createdJob] = await jobsFor(admin.id);
    expect(createdJob).toMatchObject({
      notificationKind: "reservation_created",
      reservationId,
    });
    expect(lastScheduledJobIds()).toEqual([createdJob!.id]);
    const [createdItem, ...noMore] = await inboxFor(admin.id);
    expect(noMore).toEqual([]);
    expect(createdItem).toMatchObject({
      kind: "reservation_created_admin",
      category: "admin",
      dedupeKey: jobDedupeKey(createdJob!.id),
      title: `Nueva reserva de ${owner.displayName}`,
      actionPath: `/dashboard/reservations/${reservationId}/edit`,
      readAt: null,
    });
    expect(createdItem!.data).toEqual({
      ...reservationRef,
      participantName: owner.displayName,
    });

    const proofKey = randomUUID();
    trackRequestKey(proofKey);
    expect(
      (
        await withActor(owner, () =>
          submitPaymentProof({
            invoiceId: invoice.id,
            voucherUrl: "https://utfs.io/f/inbox-proof",
            fileKey: `inbox-${proofKey}`,
            source: "uploadthing",
            idempotencyKey: proofKey,
          }),
        )
      ).success,
    ).toBe(true);

    const [ownerProofJob] = await jobsFor(owner.id);
    expect(ownerProofJob).toMatchObject({
      notificationKind: "proof_submitted",
      reservationId,
    });
    const adminProofJob = (await jobsFor(admin.id)).find(
      (job) => job.notificationKind === "proof_submitted",
    );
    expect(adminProofJob).toBeDefined();
    expect(lastScheduledJobIds()).toEqual(
      sortedIds(ownerProofJob!.id, adminProofJob!.id),
    );

    const [proofItem, ...noOther] = await inboxFor(owner.id);
    expect(noOther).toEqual([]);
    expect(proofItem).toMatchObject({
      kind: "reservation_proof_submitted",
      category: "credits",
      dedupeKey: jobDedupeKey(ownerProofJob!.id),
      title: "Recibimos tu comprobante de pago",
      actionPath: reservationPath(owner.id, festival.id, reservationId),
    });
    // A receipt for their own upload: kept, but it does not light the badge.
    expect(proofItem!.readAt).toBeInstanceOf(Date);
    expect(proofItem!.data).toEqual({ ...reservationRef, profileId: owner.id });

    const adminProofItem = (await inboxFor(admin.id)).find(
      (row) => row.dedupeKey === jobDedupeKey(adminProofJob!.id),
    );
    expect(adminProofItem).toMatchObject({
      kind: "reservation_proof_submitted_admin",
      category: "admin",
      title: `${owner.displayName} subió el comprobante de su reserva`,
      actionPath: `/dashboard/festivals/${festival.id}/reservations?lens=cobros&reservation=${reservationId}`,
      readAt: null,
    });
    expect(adminProofItem!.data).toEqual({
      ...reservationRef,
      participantName: owner.displayName,
    });

    const [submission] = await integrationDb!
      .select()
      .from(invoiceSettlementSubmissions)
      .where(eq(invoiceSettlementSubmissions.invoiceId, invoice.id));
    expect(
      (
        await withActor(admin, () =>
          approveInvoiceSettlement({ submissionId: submission.id }),
        )
      ).success,
    ).toBe(true);

    const approvedJob = (await jobsFor(owner.id)).find(
      (job) => job.notificationKind === "settlement_approved",
    );
    expect(approvedJob).toBeDefined();
    expect(lastScheduledJobIds()).toEqual([approvedJob!.id]);
    const confirmed = (await inboxFor(owner.id)).find(
      (row) => row.dedupeKey === jobDedupeKey(approvedJob!.id),
    );
    expect(confirmed).toMatchObject({
      kind: "reservation_confirmed",
      category: "reservations",
      title: "¡Tu reserva está confirmada!",
      body: `Confirmamos tu reserva del espacio ${standLabelOf(stand)} en ${festival.name}. ¡Te esperamos!`,
      actionPath: reservationPath(owner.id, festival.id, reservationId),
      readAt: null,
    });
    // The fixture festival has no dates or place: nothing to snapshot.
    expect(confirmed!.data).toEqual({
      ...reservationRef,
      profileId: owner.id,
      startsAt: null,
      locationLabel: null,
    });
    await expectParticipantInboxMirrorsJobs(owner.id);
    // Approval emails the payer alone.
    expect((await inboxFor(admin.id)).map((row) => row.kind)).toEqual([
      "reservation_created_admin",
      "reservation_proof_submitted_admin",
    ]);
  });

  it("keeps admin copies from the admin who acted and the admin who pays the cobro", async () => {
    const {
      users: [owner, actingAdmin, otherAdmin, payerAdmin],
      stands: [assignedStand, ownStand],
      festival,
      trackRequestKey,
      trackReservation,
      trackInvoice,
    } = await seedFixture({
      userCount: 4,
      standCount: 2,
      roles: ["user", "admin", "admin", "admin"],
    });
    adminsAre(actingAdmin, otherAdmin, payerAdmin);

    // An admin assigns a stand: every admin is emailed, the one who did it
    // gets no item.
    const createKey = randomUUID();
    trackRequestKey(createKey);
    const created = await withActor(actingAdmin, () =>
      createAdminReservation({
        festivalId: festival.id,
        standId: assignedStand.id,
        ownerUserId: owner.id,
        idempotencyKey: createKey,
      }),
    );
    expect(created.success).toBe(true);
    const assignedId = created.reservationId!;
    await trackReservationRows(festival.id, trackReservation, trackInvoice);

    for (const admin of [actingAdmin, otherAdmin, payerAdmin]) {
      expect(
        (await jobsFor(admin.id)).map((job) => [
          job.notificationKind,
          job.reservationId,
        ]),
      ).toEqual([["reservation_created", assignedId]]);
    }
    expect(lastScheduledJobIds()).toHaveLength(3);
    expect(await inboxFor(actingAdmin.id)).toEqual([]);
    for (const admin of [otherAdmin, payerAdmin]) {
      const [job] = await jobsFor(admin.id);
      const inbox = await inboxFor(admin.id);
      expect(inbox).toHaveLength(1);
      expect(inbox[0]).toMatchObject({
        kind: "reservation_created_admin",
        category: "admin",
        dedupeKey: jobDedupeKey(job!.id),
        title: `Nueva reserva de ${owner.displayName}`,
        actionPath: `/dashboard/reservations/${assignedId}/edit`,
      });
      expect(dataOf(inbox[0]!)).toMatchObject({
        reservationId: assignedId,
        participantName: owner.displayName,
      });
    }
    // The participant is not told until the payment reminder (PRD §11).
    expect(await jobsFor(owner.id)).toEqual([]);
    expect(await inboxFor(owner.id)).toEqual([]);

    // An admin books and pays their own stand: they get the participant's
    // receipt, not the admin copies of their own reservation.
    const hold = await holdFor(payerAdmin, ownStand.id, trackRequestKey);
    expect(
      (await confirmFor(payerAdmin, hold.id, trackRequestKey)).success,
    ).toBe(true);
    await trackReservationRows(festival.id, trackReservation, trackInvoice);
    const [ownInvoice] = await integrationDb!
      .select()
      .from(invoices)
      .where(eq(invoices.userId, payerAdmin.id));
    const ownId = ownInvoice.reservationId;
    const proofKey = randomUUID();
    trackRequestKey(proofKey);
    expect(
      (
        await withActor(payerAdmin, () =>
          submitPaymentProof({
            invoiceId: ownInvoice.id,
            voucherUrl: "https://utfs.io/f/inbox-admin-proof",
            fileKey: `inbox-admin-${proofKey}`,
            source: "uploadthing",
            idempotencyKey: proofKey,
          }),
        )
      ).success,
    ).toBe(true);

    // Emailed as the payer and as an admin; one item, the payer's.
    const payerJobs = (await jobsFor(payerAdmin.id)).filter(
      (job) => job.reservationId === ownId,
    );
    expect(payerJobs.map((job) => job.notificationKind).sort()).toEqual([
      "proof_submitted",
      "proof_submitted",
      "reservation_created",
    ]);
    const ownItems = (await inboxFor(payerAdmin.id)).filter(
      (row) => dataOf(row).reservationId === ownId,
    );
    expect(ownItems.map((row) => row.kind)).toEqual([
      "reservation_proof_submitted",
    ]);
    expect(ownItems[0]!.readAt).toBeInstanceOf(Date);
    expect(payerJobs.map((job) => jobDedupeKey(job.id))).toContain(
      ownItems[0]!.dedupeKey,
    );

    // The other admins hear about both, in the payer's name.
    for (const admin of [actingAdmin, otherAdmin]) {
      const items = (await inboxFor(admin.id)).filter(
        (row) => dataOf(row).reservationId === ownId,
      );
      expect(items.map((row) => [row.kind, row.title])).toEqual([
        [
          "reservation_created_admin",
          `Nueva reserva de ${payerAdmin.displayName}`,
        ],
        [
          "reservation_proof_submitted_admin",
          `${payerAdmin.displayName} subió el comprobante de su reserva`,
        ],
      ]);
    }
  });

  it("writes no inbox copy for a proof correction, a settlement rejection or a deduplicated proof", async () => {
    const {
      users: [correctedOwner, rejectedOwner, admin],
      stands: [correctedStand, rejectedStand],
      festival,
      trackRequestKey,
      trackReservation,
      trackInvoice,
    } = await seedFixture({
      userCount: 3,
      standCount: 2,
      roles: ["user", "user", "admin"],
    });
    adminsAre(admin);

    const submitProofFor = async (
      owner: { id: number; role: string },
      invoiceId: number,
    ) => {
      const key = randomUUID();
      trackRequestKey(key);
      const result = await withActor(owner, () =>
        submitPaymentProof({
          invoiceId,
          voucherUrl: `https://utfs.io/f/inbox-${key}`,
          fileKey: `inbox-${key}`,
          source: "uploadthing",
          idempotencyKey: key,
        }),
      );
      expect(result.success).toBe(true);
    };

    const invoiceByOwner = new Map<number, typeof invoices.$inferSelect>();
    for (const [owner, stand] of [
      [correctedOwner, correctedStand],
      [rejectedOwner, rejectedStand],
    ] as const) {
      const hold = await holdFor(owner, stand.id, trackRequestKey);
      expect((await confirmFor(owner, hold.id, trackRequestKey)).success).toBe(
        true,
      );
      await trackReservationRows(festival.id, trackReservation, trackInvoice);
      const [invoice] = await integrationDb!
        .select()
        .from(invoices)
        .where(eq(invoices.userId, owner.id));
      invoiceByOwner.set(owner.id, invoice);
      await submitProofFor(owner, invoice.id);
    }
    const adminItemsBefore = await inboxFor(admin.id);
    expect(adminItemsBefore.map((row) => row.kind).sort()).toEqual([
      "reservation_created_admin",
      "reservation_created_admin",
      "reservation_proof_submitted_admin",
      "reservation_proof_submitted_admin",
    ]);

    const correctionKey = randomUUID();
    trackRequestKey(correctionKey);
    expect(
      (
        await withActor(admin, () =>
          correctSettlementProof({
            invoiceId: invoiceByOwner.get(correctedOwner.id)!.id,
            reason: "archivo ilegible",
            idempotencyKey: correctionKey,
          }),
        )
      ).success,
    ).toBe(true);
    const [rejectedSubmission] = await integrationDb!
      .select()
      .from(invoiceSettlementSubmissions)
      .where(
        eq(
          invoiceSettlementSubmissions.invoiceId,
          invoiceByOwner.get(rejectedOwner.id)!.id,
        ),
      );
    expect(
      (
        await withActor(admin, () =>
          rejectInvoiceSettlement({
            submissionId: rejectedSubmission.id,
            reason: "monto incorrecto",
            correction: { type: "keep_amount" },
          }),
        )
      ).success,
    ).toBe(true);

    for (const owner of [correctedOwner, rejectedOwner]) {
      const { jobs, inbox } = await expectParticipantInboxMirrorsJobs(owner.id);
      // The email is queued (and never sent while the reservation is
      // pending); the inbox gets nothing.
      expect(jobs.map((job) => job.notificationKind)).toEqual([
        "proof_submitted",
        "settlement_rejected",
      ]);
      expect(inbox.map((row) => row.kind)).toEqual([
        "reservation_proof_submitted",
      ]);
      expect(inbox.map((row) => row.dedupeKey)).not.toContain(
        jobDedupeKey(jobs[1]!.id),
      );
    }

    // A second proof for the same reservation is the same email to the
    // outbox: deduplicated away, so no second item for anyone.
    await submitProofFor(
      correctedOwner,
      invoiceByOwner.get(correctedOwner.id)!.id,
    );
    const { jobs: jobsAfter, inbox: inboxAfter } =
      await expectParticipantInboxMirrorsJobs(correctedOwner.id);
    expect(jobsAfter.map((job) => job.notificationKind)).toEqual([
      "proof_submitted",
      "settlement_rejected",
    ]);
    expect(inboxAfter.map((row) => row.kind)).toEqual([
      "reservation_proof_submitted",
    ]);
    // Neither a correction, a rejection nor the repeated proof reaches the
    // admins' inbox.
    expect(await inboxFor(admin.id)).toEqual(adminItemsBefore);
  });

  it("copies a cancellation and its reason to every participant", async () => {
    const {
      users: [owner, partner, admin],
      stands: [stand],
      festival,
      trackRequestKey,
      trackReservation,
      trackInvoice,
    } = await seedFixture({
      userCount: 3,
      standCount: 1,
      roles: ["user", "user", "admin"],
    });
    const hold = await holdFor(owner, stand.id, trackRequestKey);
    expect(
      (await confirmFor(owner, hold.id, trackRequestKey, partner.id)).success,
    ).toBe(true);
    const [{ id: reservationId }] = await trackReservationRows(
      festival.id,
      trackReservation,
      trackInvoice,
    );

    const reason = "Reorganizamos el pabellón de ilustración";
    expect(
      (
        await withActor(admin, () =>
          cancelReservation({ reservationId, reason }),
        )
      ).success,
    ).toBe(true);

    const jobIds: number[] = [];
    for (const participant of [owner, partner]) {
      const { jobs, inbox } = await expectParticipantInboxMirrorsJobs(
        participant.id,
      );
      expect(jobs.map((job) => job.notificationKind)).toEqual([
        "reservation_rejected",
      ]);
      jobIds.push(jobs[0]!.id);
      expect(inbox).toHaveLength(1);
      const [item] = inbox;
      expect(item).toMatchObject({
        kind: "reservation_cancelled",
        category: "reservations",
        title: "Tu reserva fue cancelada",
        body: `Cancelamos tu reserva del espacio ${standLabelOf(stand)} en ${festival.name} y el espacio volvió a quedar disponible.\n\nMotivo: ${reason}`,
        actionPath: reservationPath(participant.id, festival.id, reservationId),
        readAt: null,
      });
      expect(item!.data).toEqual({
        reservationId,
        festivalId: festival.id,
        festivalName: festival.name,
        standLabel: standLabelOf(stand),
        standCount: 1,
        profileId: participant.id,
        reason,
      });
      // The admin wrote it for them: it opens on its own page.
      expect(notificationOpensDetail(item!.kind, item!.data)).toBe(true);
    }
    expect(lastScheduledJobIds()).toEqual(sortedIds(...jobIds));
    expect(await inboxFor(admin.id)).toEqual([]);
  });

  it("copies a deadline extension to the owner and the partner, each in their role", async () => {
    const {
      users: [owner, partner, admin],
      stands: [stand],
      festival,
      trackRequestKey,
      trackReservation,
      trackInvoice,
    } = await seedFixture({
      userCount: 3,
      standCount: 1,
      roles: ["user", "user", "admin"],
    });
    const hold = await holdFor(owner, stand.id, trackRequestKey);
    expect(
      (await confirmFor(owner, hold.id, trackRequestKey, partner.id)).success,
    ).toBe(true);
    const [{ id: reservationId }] = await trackReservationRows(
      festival.id,
      trackReservation,
      trackInvoice,
    );

    const dueAt = new Date(Date.now() + 9 * 24 * 60 * 60 * 1000);
    const extend = () =>
      withActor(admin, () =>
        extendReservationPaymentDeadline({ reservationId, dueAt }),
      );
    expect((await extend()).success).toBe(true);

    const reservationRef = {
      reservationId,
      festivalId: festival.id,
      festivalName: festival.name,
      standLabel: standLabelOf(stand),
      standCount: 1,
    };
    const ownerItems = (await expectParticipantInboxMirrorsJobs(owner.id))
      .inbox;
    expect(ownerItems).toHaveLength(1);
    expect(ownerItems[0]).toMatchObject({
      kind: "reservation_payment_deadline_extended",
      category: "credits",
      title: "Tenés más tiempo para pagar tu reserva",
      actionPath: reservationPath(owner.id, festival.id, reservationId),
      readAt: null,
    });
    expect(ownerItems[0]!.data).toEqual({
      ...reservationRef,
      profileId: owner.id,
      role: "owner",
      ownerName: owner.displayName,
      dueAt: dueAt.toISOString(),
    });

    const partnerItems = (await expectParticipantInboxMirrorsJobs(partner.id))
      .inbox;
    expect(partnerItems).toHaveLength(1);
    expect(partnerItems[0]).toMatchObject({
      kind: "reservation_payment_deadline_extended",
      category: "credits",
      title: "Hay más tiempo para pagar la reserva que compartís",
      actionPath: reservationPath(partner.id, festival.id, reservationId),
      readAt: null,
    });
    expect(partnerItems[0]!.data).toEqual({
      ...reservationRef,
      profileId: partner.id,
      role: "partner",
      ownerName: owner.displayName,
      dueAt: dueAt.toISOString(),
    });
    // Only the cobro's holder can upload the voucher; the partner is told who.
    expect(partnerItems[0]!.body).toContain(
      `El cobro está a nombre de ${owner.displayName}`,
    );

    // The same extension again is a replay: no second email, no second item.
    expect((await extend()).success).toBe(true);
    for (const participant of [owner, partner]) {
      const { inbox } = await expectParticipantInboxMirrorsJobs(participant.id);
      expect(inbox).toHaveLength(1);
    }
    expect(await inboxFor(admin.id)).toEqual([]);
  });

  it("copies a participation decision to the applicant", async () => {
    const {
      users: [approved, rejected, rejectedWithoutReason, admin],
      enrollments: [approvedRequest, rejectedRequest, silentRequest],
      festival,
    } = await seedFixture({
      userCount: 4,
      standCount: 1,
      roles: ["user", "user", "user", "admin"],
      enrollmentStatus: "pending",
    });
    const review = (input: Record<string, unknown>) =>
      withActor(admin, () => reviewFestivalParticipationRequest(input));

    const reason = "El cupo de ilustración ya está completo";
    expect(
      (await review({ requestId: approvedRequest.id, status: "accepted" }))
        .success,
    ).toBe(true);
    const [approvedJob] = await jobsFor(approved.id);
    expect(lastScheduledJobIds()).toEqual([approvedJob!.id]);
    expect(
      (
        await review({
          requestId: rejectedRequest.id,
          status: "rejected",
          reason,
        })
      ).success,
    ).toBe(true);
    expect(
      (await review({ requestId: silentRequest.id, status: "rejected" }))
        .success,
    ).toBe(true);

    const approvedItems = (await expectParticipantInboxMirrorsJobs(approved.id))
      .inbox;
    expect(approvedItems).toHaveLength(1);
    expect(approvedItems[0]).toMatchObject({
      kind: "festival_participation_approved",
      category: "reservations",
      dedupeKey: jobDedupeKey(approvedJob!.id),
      title: `Tu postulación para ${festival.name} fue aprobada`,
      // Reservations opened a minute before the fixture was made.
      body: "Ya podés continuar con la reserva de tu espacio.",
      actionPath: `/festivals/${festival.id}/terms`,
      actionLabel: "Reservar mi espacio",
      readAt: null,
    });
    expect(approvedItems[0]!.data).toEqual({
      festivalId: festival.id,
      festivalName: festival.name,
      reservationsStartDate: festival.reservationsStartDate!.toISOString(),
      reservationsOpen: true,
    });
    expect(
      notificationOpensDetail(approvedItems[0]!.kind, approvedItems[0]!.data),
    ).toBe(false);

    const rejectedItems = (await expectParticipantInboxMirrorsJobs(rejected.id))
      .inbox;
    expect(rejectedItems).toHaveLength(1);
    expect(rejectedItems[0]).toMatchObject({
      kind: "festival_participation_rejected",
      category: "reservations",
      title: `Novedades sobre tu postulación para ${festival.name}`,
      actionPath: null,
      readAt: null,
    });
    expect(rejectedItems[0]!.data).toEqual({
      festivalId: festival.id,
      festivalName: festival.name,
      reason,
    });
    expect(rejectedItems[0]!.body).toContain(
      `El motivo que registramos es: ${reason}`,
    );
    expect(
      notificationOpensDetail(rejectedItems[0]!.kind, rejectedItems[0]!.data),
    ).toBe(true);

    const silentItems = (
      await expectParticipantInboxMirrorsJobs(rejectedWithoutReason.id)
    ).inbox;
    expect(silentItems.map((row) => row.kind)).toEqual([
      "festival_participation_rejected",
    ]);
    expect(dataOf(silentItems[0]!).reason).toBeNull();
    expect(silentItems[0]!.body).not.toContain("El motivo");

    // Approving again changes nothing: no second email, no second item.
    expect(
      (await review({ requestId: approvedRequest.id, status: "accepted" }))
        .success,
    ).toBe(true);
    expect(
      (await expectParticipantInboxMirrorsJobs(approved.id)).inbox,
    ).toHaveLength(1);
    expect(await inboxFor(admin.id)).toEqual([]);
  });
});
