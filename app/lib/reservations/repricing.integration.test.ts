// @vitest-environment node

import { randomUUID } from "crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
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
  creditLedgerEntries,
  festivalSectors,
  festivals,
  invoiceCreditAllocations,
  invoiceSettlementSubmissions,
  invoices,
  payments,
  reservationFeatureActionItems,
  reservationFeatureActions,
  reservationParticipants,
  reservationRequestRegistry,
  scheduledTasks,
  standGroups,
  standReservationEvents,
  standReservationStands,
  standReservations,
  stands,
  userRequests,
  users,
} from "@/db/schema";

/**
 * The shared repricing model end to end: every command that changes what a
 * live reservation costs counts a late partner's payment, keeps a write-off,
 * asks a free-confirmed reservation for the difference, and confirms a waiting
 * reservation it leaves fully paid (Dennis, 2026-09-29).
 */

const currentProfileMock = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: currentProfileMock,
  getCurrentBaseProfile: currentProfileMock,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/lib/reservations/notification-outbox", () => ({
  enqueueAdminAndOwnerNotifications: vi.fn().mockResolvedValue([]),
  enqueueReservationNotification: vi.fn().mockResolvedValue(null),
  scheduleReservationNotificationJobs: vi.fn(),
}));
vi.mock("@/app/lib/uploadthing/actions", () => ({
  enqueueStorageCleanupJob: vi.fn(),
}));
vi.mock("@/app/api/users/actions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/api/users/actions")>()),
  fetchAdminUsers: vi.fn().mockResolvedValue([]),
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
  ? new Pool({ connectionString: testDatabaseUrl, max: 5 })
  : null;
const integrationDb = pool ? drizzle(pool, { schema }) : null;
const describeDatabase = integrationDb ? describe : describe.skip;

type Fixture = { festivalId: number; userIds: number[] };
const fixtures: Fixture[] = [];

let changeReservationStand: (typeof import("@/app/lib/reservations/stand-change-service"))["changeReservationStand"];
let upgradeFullTableReservation: (typeof import("@/app/lib/reservations/full-table-upgrade-service"))["upgradeFullTableReservation"];
let fetchFullTableUpgradePreview: (typeof import("@/app/lib/reservations/full-table-upgrade-queries"))["fetchFullTableUpgradePreview"];
let downgradeFullTableReservation: (typeof import("@/app/lib/reservations/full-table-service"))["downgradeFullTableReservation"];
let updateReservationPartner: (typeof import("@/app/lib/reservations/admin-service"))["updateReservationPartner"];
let latePartnerPrepaidAmount: (typeof import("@/app/lib/reservations/late-partner-prepaid"))["latePartnerPrepaidAmount"];
let creditService: typeof import("@/app/lib/credits/service");
let paymentService: typeof import("@/app/lib/reservations/payment-service");

const ADMIN = { id: 0, role: "admin", status: "verified", category: "none" };

describeDatabase("reservation repricing", () => {
  beforeAll(async () => {
    // `=` rather than `??=`: a POSTGRES_URL inherited from .env.local must
    // never be the database the app code under test writes to.
    process.env.POSTGRES_URL = testDatabaseUrl!;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";
    ({ changeReservationStand } =
      await import("@/app/lib/reservations/stand-change-service"));
    ({ upgradeFullTableReservation } =
      await import("@/app/lib/reservations/full-table-upgrade-service"));
    ({ fetchFullTableUpgradePreview } =
      await import("@/app/lib/reservations/full-table-upgrade-queries"));
    ({ downgradeFullTableReservation } =
      await import("@/app/lib/reservations/full-table-service"));
    ({ updateReservationPartner } =
      await import("@/app/lib/reservations/admin-service"));
    ({ latePartnerPrepaidAmount } =
      await import("@/app/lib/reservations/late-partner-prepaid"));
    creditService = await import("@/app/lib/credits/service");
    paymentService = await import("@/app/lib/reservations/payment-service");
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
        const invoiceRows = await db
          .select({ id: invoices.id })
          .from(invoices)
          .where(inArray(invoices.reservationId, reservationIds));
        const invoiceIds = invoiceRows.map((row) => row.id);
        if (invoiceIds.length > 0) {
          await db
            .delete(invoiceSettlementSubmissions)
            .where(inArray(invoiceSettlementSubmissions.invoiceId, invoiceIds));
          await db
            .delete(payments)
            .where(inArray(payments.invoiceId, invoiceIds));
          // Cascades to invoice_credit_allocations.
          await db.delete(invoices).where(inArray(invoices.id, invoiceIds));
        }
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
        await db
          .delete(standReservationStands)
          .where(inArray(standReservationStands.reservationId, reservationIds));
      }
      // The ledger is append-only in production, enforced by a trigger, and
      // both its user and feature-action FKs are `restrict` — so it goes first,
      // with the trigger dropped only for this delete.
      const client = await pool!.connect();
      try {
        await client.query(
          "ALTER TABLE credit_ledger_entries DISABLE TRIGGER credit_ledger_entries_append_only",
        );
        await client.query(
          "DELETE FROM credit_ledger_entries WHERE user_id = ANY($1::int[])",
          [fixture.userIds],
        );
      } finally {
        await client.query(
          "ALTER TABLE credit_ledger_entries ENABLE TRIGGER credit_ledger_entries_append_only",
        );
        client.release();
      }
      // Cascades to the action items.
      await db
        .delete(reservationFeatureActions)
        .where(eq(reservationFeatureActions.festivalId, fixture.festivalId));
      if (reservationIds.length > 0) {
        await db
          .delete(standReservations)
          .where(inArray(standReservations.id, reservationIds));
      }
      await db.delete(stands).where(eq(stands.festivalId, fixture.festivalId));
      await db
        .delete(standGroups)
        .where(
          inArray(
            standGroups.festivalSectorId,
            db
              .select({ id: festivalSectors.id })
              .from(festivalSectors)
              .where(eq(festivalSectors.festivalId, fixture.festivalId)),
          ),
        );
      await db
        .delete(festivalSectors)
        .where(eq(festivalSectors.festivalId, fixture.festivalId));
      for (const userId of fixture.userIds) {
        await db.delete(userRequests).where(eq(userRequests.userId, userId));
        await db
          .delete(reservationRequestRegistry)
          .where(eq(reservationRequestRegistry.actorUserId, userId));
        await db.delete(users).where(eq(users.id, userId));
      }
      await db.delete(festivals).where(eq(festivals.id, fixture.festivalId));
    }
  });

  afterAll(async () => {
    await pool?.end();
  });

  type Price = { individual: number; shared?: number | null };

  /**
   * One sector: optional declared full tables (both halves at the table's
   * half prices) and loose stands.
   */
  async function seedFestival(input: {
    userCount: number;
    looseStands?: Price[];
    tables?: (Price & { fullTablePrice: number })[];
  }) {
    const db = integrationDb!;
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const [festival] = await db
      .insert(festivals)
      .values({
        name: `Repricing ${suffix}`,
        status: "active",
        festivalType: "glitter",
        reservationsStartDate: new Date(Date.now() - 60_000),
      })
      .returning();

    const [admin] = await db
      .insert(users)
      .values({
        clerkId: `rp-admin-${suffix}`,
        email: `rp-admin-${suffix}@example.test`,
        displayName: `RP Admin ${suffix}`,
        status: "verified",
        role: "admin",
      })
      .returning();

    const participants = await db
      .insert(users)
      .values(
        Array.from({ length: input.userCount }, (_, index) => ({
          clerkId: `rp-${suffix}-${index}`,
          email: `rp-${suffix}-${index}@example.test`,
          displayName: `RP ${suffix}-${index}`,
          status: "verified" as const,
          category: "illustration" as const,
        })),
      )
      .returning();

    await db.insert(userRequests).values(
      participants.map((user) => ({
        userId: user.id,
        festivalId: festival.id,
        type: "festival_participation" as const,
        status: "accepted" as const,
      })),
    );

    const [sector] = await db
      .insert(festivalSectors)
      .values({
        name: `S ${suffix}`,
        festivalId: festival.id,
        orderInFestival: 1,
      })
      .returning();

    let standNumber = 1;
    const tables: (typeof stands.$inferSelect)[][] = [];
    for (const table of input.tables ?? []) {
      const [group] = await db
        .insert(standGroups)
        .values({
          festivalSectorId: sector.id,
          type: "full_table",
          fullTablePrice: table.fullTablePrice,
        })
        .returning();
      tables.push(
        await db
          .insert(stands)
          .values(
            [0, 1].map(() => ({
              festivalId: festival.id,
              festivalSectorId: sector.id,
              standGroupId: group.id,
              standNumber: standNumber++,
              standCategory: "illustration" as const,
              status: "available" as const,
              price: table.individual,
              individualPrice: table.individual,
              sharedPrice: table.shared ?? null,
            })),
          )
          .returning(),
      );
    }

    const looseStands =
      (input.looseStands ?? []).length === 0
        ? []
        : await db
            .insert(stands)
            .values(
              (input.looseStands ?? []).map((price) => ({
                festivalId: festival.id,
                festivalSectorId: sector.id,
                standNumber: standNumber++,
                standCategory: "illustration" as const,
                status: "available" as const,
                price: price.individual,
                individualPrice: price.individual,
                sharedPrice: price.shared ?? null,
              })),
            )
            .returning();

    fixtures.push({
      festivalId: festival.id,
      userIds: [admin.id, ...participants.map((user) => user.id)],
    });
    currentProfileMock.mockResolvedValue({ ...ADMIN, id: admin.id });

    return { festival, admin, participants, tables, looseStands };
  }

  /** A live reservation built directly: one stand, or both halves of a table. */
  async function seedReservation(input: {
    festivalId: number;
    standIds: number[];
    ownerUserId: number | null;
    participantUserIds?: number[];
    status?: "pending" | "verification_payment" | "accepted";
    price: number;
    individualPrice?: number;
    sharedPrice?: number | null;
    fullTablePrice?: number | null;
    standStatus?: "reserved" | "confirmed";
    discountAmount?: number;
    /** Overrides `amount`, e.g. after an admin wrote part of it off. */
    invoiceAmount?: number;
    invoiceStatus?: "pending" | "verification_payment" | "paid";
    /** Who the cobro is for; defaults to the owner. */
    invoiceUserId?: number;
  }) {
    const db = integrationDb!;
    const participantUserIds =
      input.participantUserIds ??
      (input.ownerUserId != null ? [input.ownerUserId] : []);
    const [reservation] = await db
      .insert(standReservations)
      .values({
        festivalId: input.festivalId,
        standId: input.standIds[0],
        status: input.status ?? "pending",
        source: "admin_assignment",
        ownerUserId: input.ownerUserId,
        priceAmountSnapshot: input.price,
        individualPriceSnapshot: input.individualPrice ?? input.price,
        sharedPriceSnapshot: input.sharedPrice ?? null,
        fullTablePriceSnapshot: input.fullTablePrice ?? null,
        bookedParticipantCount: Math.max(1, participantUserIds.length),
      })
      .returning();

    await db.insert(standReservationStands).values(
      input.standIds.map((standId, position) => ({
        reservationId: reservation.id,
        standId,
        position,
      })),
    );
    if (participantUserIds.length > 0) {
      await db.insert(reservationParticipants).values(
        participantUserIds.map((userId) => ({
          userId,
          reservationId: reservation.id,
        })),
      );
    }

    const discountAmount = input.discountAmount ?? 0;
    const [invoice] = await db
      .insert(invoices)
      .values({
        date: new Date(),
        userId: input.invoiceUserId ?? input.ownerUserId!,
        reservationId: reservation.id,
        originalAmount: input.price,
        discountAmount,
        amount: input.invoiceAmount ?? input.price - discountAmount,
        status: input.invoiceStatus ?? "pending",
      })
      .returning();

    await db
      .update(stands)
      .set({ status: input.standStatus ?? "reserved" })
      .where(inArray(stands.id, input.standIds));

    return { reservation, invoice };
  }

  /**
   * A late partner already on the reservation, recorded exactly as
   * `addLatePartner` records it: a fulfilled action with the shared
   * difference and the fee as separate items.
   */
  async function seedLatePartner(input: {
    festivalId: number;
    reservationId: number;
    ownerUserId: number;
    partnerUserId: number | null;
    difference: number;
    fee?: number;
    status?: "fulfilled" | "cancelled";
  }) {
    const db = integrationDb!;
    const fee = input.fee ?? 50;
    const [action] = await db
      .insert(reservationFeatureActions)
      .values({
        festivalId: input.festivalId,
        reservationId: input.reservationId,
        ownerUserId: input.ownerUserId,
        type: "late_partner",
        status: input.status ?? "fulfilled",
        featurePriceSnapshot: fee,
        targetPartnerUserId: input.partnerUserId,
        idempotencyKey: `late-partner:${randomUUID()}`,
        fulfilledAt: new Date(),
      })
      .returning();
    await db.insert(reservationFeatureActionItems).values([
      {
        featureActionId: action.id,
        kind: "shared_price_difference" as const,
        amount: input.difference,
      },
      {
        featureActionId: action.id,
        kind: "feature_access" as const,
        amount: fee,
      },
    ]);
    return action;
  }

  /** Approved cash: a payment plus the approved submission vouching for it. */
  async function payInvoice(input: {
    invoiceId: number;
    amount: number;
    userId: number;
  }) {
    const db = integrationDb!;
    const [payment] = await db
      .insert(payments)
      .values({
        amount: input.amount,
        date: new Date(),
        invoiceId: input.invoiceId,
        voucherUrl: "/img/voucher.png",
      })
      .returning();
    await db.insert(invoiceSettlementSubmissions).values({
      invoiceId: input.invoiceId,
      paymentId: payment.id,
      kind: "payment_proof",
      status: "approved",
      uploadedByUserId: input.userId,
      reviewedByUserId: input.userId,
      reviewedAt: new Date(),
    });
    return payment;
  }

  /** Credits spent on the cobro the way applyInvoiceCredits spends them. */
  async function allocateCredits(input: {
    invoiceId: number;
    userId: number;
    amount: number;
  }) {
    const db = integrationDb!;
    const granted = await creditService.adjustCreditAccount({
      userId: input.userId,
      amount: input.amount,
      reason: "integration fixture",
      idempotencyKey: randomUUID(),
    });
    if (!granted.ok) throw new Error(`fixture grant failed: ${granted.code}`);
    const debit = await creditService.debitConfirmedCreditsForInvoiceInTx(
      db as never,
      {
        userId: input.userId,
        amount: input.amount,
        idempotencyKey: randomUUID(),
      },
    );
    if (!debit.ok) throw new Error(`fixture debit failed: ${debit.code}`);
    await db.insert(invoiceCreditAllocations).values({
      invoiceId: input.invoiceId,
      userId: input.userId,
      amount: input.amount,
      ledgerEntryId: debit.data.ledgerEntryId,
      idempotencyKey: randomUUID(),
    });
  }

  async function openPaymentTask(reservationId: number, profileId: number) {
    await integrationDb!.insert(scheduledTasks).values({
      dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      reminderTime: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      profileId,
      reservationId,
      taskType: "stand_reservation",
    });
  }

  async function readReservation(id: number) {
    const [row] = await integrationDb!
      .select()
      .from(standReservations)
      .where(eq(standReservations.id, id));
    return row;
  }

  async function readInvoice(id: number) {
    const [row] = await integrationDb!
      .select()
      .from(invoices)
      .where(eq(invoices.id, id));
    return row;
  }

  async function readStandStatus(id: number) {
    const [row] = await integrationDb!
      .select({ status: stands.status })
      .from(stands)
      .where(eq(stands.id, id));
    return row?.status;
  }

  async function readTasks(reservationId: number) {
    return integrationDb!
      .select()
      .from(scheduledTasks)
      .where(eq(scheduledTasks.reservationId, reservationId));
  }

  /** Grants a repricing command handed back, tagged to the reservation. */
  async function readRefunds(userId: number) {
    const rows = await integrationDb!
      .select()
      .from(creditLedgerEntries)
      .where(
        and(
          eq(creditLedgerEntries.userId, userId),
          eq(creditLedgerEntries.type, "admin_grant"),
        ),
      );
    return rows.filter(
      (row) =>
        (row.metadata as Record<string, string>)
          .standChangeRefundReservationId != null,
    );
  }

  async function readEvents(reservationId: number) {
    return integrationDb!
      .select()
      .from(standReservationEvents)
      .where(eq(standReservationEvents.reservationId, reservationId));
  }

  async function upgradeAsPreviewed(reservationId: number) {
    const preview = await fetchFullTableUpgradePreview(reservationId);
    if (!preview?.expected || !preview.plan) {
      throw new Error("expected an upgradable preview");
    }
    const result = await upgradeFullTableReservation({
      reservationId,
      idempotencyKey: randomUUID(),
      expected: preview.expected,
    });
    return { preview, result };
  }

  async function moveTo(
    reservationId: number,
    standId: number,
    allowExchange?: boolean,
  ) {
    const result = await changeReservationStand({
      reservationId,
      destinationStandId: standId,
      idempotencyKey: randomUUID(),
      ...(allowExchange ? { allowExchange } : {}),
    });
    expect(result).toMatchObject({ success: true });
  }

  /** The locked-path tender, as every settlement guard reads it. */
  async function tenderOf(invoiceId: number) {
    const row = await readInvoice(invoiceId);
    return integrationDb!.transaction((tx) =>
      paymentService.getInvoiceTenderTotalsInTx(tx, {
        id: invoiceId,
        amount: row.amount,
      }),
    );
  }

  /**
   * Stand I500/S800. The owner paid the Bs500 cobro in cash, then added a late
   * partner and paid the Bs300 shared difference (plus a Bs50 fee) in credits.
   */
  async function seedLatePartnerReservation(input: {
    festivalId: number;
    standId: number;
    owner: number;
    partner: number;
    paid?: boolean;
  }) {
    const paid = input.paid ?? true;
    const seeded = await seedReservation({
      festivalId: input.festivalId,
      standIds: [input.standId],
      ownerUserId: input.owner,
      participantUserIds: [input.owner, input.partner],
      status: paid ? "accepted" : "pending",
      price: 500,
      individualPrice: 500,
      sharedPrice: 800,
      standStatus: paid ? "confirmed" : "reserved",
      invoiceStatus: paid ? "paid" : "pending",
    });
    if (paid) {
      await payInvoice({
        invoiceId: seeded.invoice.id,
        amount: 500,
        userId: input.owner,
      });
    }
    await seedLatePartner({
      festivalId: input.festivalId,
      reservationId: seeded.reservation.id,
      ownerUserId: input.owner,
      partnerUserId: input.partner,
      difference: 300,
    });
    return seeded;
  }

  describe("a late partner's payment counts as paid", () => {
    it("counts only fulfilled, unreversed shared differences, never the fee", async () => {
      const seeded = await seedFestival({
        userCount: 2,
        looseStands: [{ individual: 500, shared: 800 }],
      });
      const [owner, partner] = seeded.participants;
      const { reservation } = await seedReservation({
        festivalId: seeded.festival.id,
        standIds: [seeded.looseStands[0].id],
        ownerUserId: owner.id,
        participantUserIds: [owner.id, partner.id],
        price: 500,
        sharedPrice: 800,
      });
      const counted = await seedLatePartner({
        festivalId: seeded.festival.id,
        reservationId: reservation.id,
        ownerUserId: owner.id,
        partnerUserId: partner.id,
        difference: 300,
        fee: 50,
      });
      await seedLatePartner({
        festivalId: seeded.festival.id,
        reservationId: reservation.id,
        ownerUserId: owner.id,
        partnerUserId: partner.id,
        difference: 100,
        status: "cancelled",
      });
      const reversed = await seedLatePartner({
        festivalId: seeded.festival.id,
        reservationId: reservation.id,
        ownerUserId: owner.id,
        partnerUserId: partner.id,
        difference: 70,
      });
      const [spend] = await integrationDb!
        .insert(creditLedgerEntries)
        .values({
          userId: owner.id,
          amount: -120,
          type: "spend",
          featureActionId: reversed.id,
          idempotencyKey: randomUUID(),
        })
        .returning();
      await integrationDb!.insert(creditLedgerEntries).values({
        userId: owner.id,
        amount: 120,
        // What `refundInvoiceCreditsInTx` posts to hand a spend back.
        type: "admin_adjustment",
        reversesEntryId: spend.id,
        idempotencyKey: randomUUID(),
      });
      // The counted action's own spend, unreversed, changes nothing.
      await integrationDb!.insert(creditLedgerEntries).values({
        userId: owner.id,
        amount: -350,
        type: "spend",
        featureActionId: counted.id,
        idempotencyKey: randomUUID(),
      });

      expect(
        await integrationDb!.transaction((tx) =>
          latePartnerPrepaidAmount(tx as never, reservation.id),
        ),
      ).toBe(300);
    });

    it("(a) moves a paid late-partner reservation to an identical stand without touching money", async () => {
      const seeded = await seedFestival({
        userCount: 2,
        looseStands: [
          { individual: 500, shared: 800 },
          { individual: 500, shared: 800 },
        ],
      });
      const [owner, partner] = seeded.participants;
      const [origin, destination] = seeded.looseStands;
      const { reservation, invoice } = await seedLatePartnerReservation({
        festivalId: seeded.festival.id,
        standId: origin.id,
        owner: owner.id,
        partner: partner.id,
      });

      expect(
        await changeReservationStand({
          reservationId: reservation.id,
          destinationStandId: destination.id,
          idempotencyKey: randomUUID(),
        }),
      ).toMatchObject({ success: true });

      // Before the netting this reopened the reservation for Bs300 more.
      const moved = await readReservation(reservation.id);
      expect(moved.status).toBe("accepted");
      expect(moved.standId).toBe(destination.id);
      expect(Number(moved.priceAmountSnapshot)).toBe(500);
      const untouched = await readInvoice(invoice.id);
      expect(Number(untouched.amount)).toBe(500);
      expect(untouched.status).toBe("paid");
      expect(await readStandStatus(destination.id)).toBe("confirmed");
      expect(await readRefunds(owner.id)).toHaveLength(0);
      expect(
        (await readTasks(reservation.id)).filter((t) => t.completedAt == null),
      ).toHaveLength(0);
    });

    it("(b) moves it to an I400/S600 stand: cobro 300 and Bs200 back, still accepted", async () => {
      const seeded = await seedFestival({
        userCount: 2,
        looseStands: [
          { individual: 500, shared: 800 },
          { individual: 400, shared: 600 },
        ],
      });
      const [owner, partner] = seeded.participants;
      const [origin, destination] = seeded.looseStands;
      const { reservation, invoice } = await seedLatePartnerReservation({
        festivalId: seeded.festival.id,
        standId: origin.id,
        owner: owner.id,
        partner: partner.id,
      });

      expect(
        await changeReservationStand({
          reservationId: reservation.id,
          destinationStandId: destination.id,
          idempotencyKey: randomUUID(),
        }),
      ).toMatchObject({ success: true });

      const moved = await readReservation(reservation.id);
      expect(moved.status).toBe("accepted");
      expect(Number(moved.priceAmountSnapshot)).toBe(300);
      expect(Number(moved.individualPriceSnapshot)).toBe(400);
      expect(Number(moved.sharedPriceSnapshot)).toBe(600);
      const repriced = await readInvoice(invoice.id);
      expect(Number(repriced.originalAmount)).toBe(300);
      expect(Number(repriced.amount)).toBe(300);
      expect(repriced.status).toBe("paid");
      const refunds = await readRefunds(owner.id);
      expect(refunds.map((row) => Number(row.amount))).toEqual([200]);
      expect(await readStandStatus(destination.id)).toBe("confirmed");
    });

    it("hands back a late partner's payment beyond a cheaper stand's whole price, and confirms a pending reservation", async () => {
      // Nothing paid on the cobro: the credit lock has to be taken for the
      // late partner's payment alone, or this is a permanent conflict.
      const seeded = await seedFestival({
        userCount: 2,
        looseStands: [
          { individual: 500, shared: 800 },
          { individual: 100, shared: 200 },
        ],
      });
      const [owner, partner] = seeded.participants;
      const [origin, destination] = seeded.looseStands;
      const { reservation, invoice } = await seedLatePartnerReservation({
        festivalId: seeded.festival.id,
        standId: origin.id,
        owner: owner.id,
        partner: partner.id,
        paid: false,
      });

      expect(
        await changeReservationStand({
          reservationId: reservation.id,
          destinationStandId: destination.id,
          idempotencyKey: randomUUID(),
        }),
      ).toMatchObject({ success: true });

      const repriced = await readInvoice(invoice.id);
      expect(Number(repriced.amount)).toBe(0);
      expect(repriced.status).toBe("paid");
      expect((await readReservation(reservation.id)).status).toBe("accepted");
      expect(await readStandStatus(destination.id)).toBe("confirmed");
      expect(
        (await readRefunds(owner.id)).map((row) => Number(row.amount)),
      ).toEqual([100]);
    });

    /**
     * The late partner's part of that refund never sat on the cobro. Netted
     * against the cobro's tender, it was clamped away on the cheap stand and
     * then came back against the next payment: moved back up, the cobro asked
     * for Bs500 of the Bs600 owed, and once paid it read Bs100 outstanding.
     */
    it("asks for a returned late-partner excess again on the way back up, and the paid cobro ends at Bs0", async () => {
      const seeded = await seedFestival({
        userCount: 2,
        looseStands: [
          { individual: 500, shared: 800 },
          { individual: 100, shared: 200 },
          { individual: 500, shared: 800 },
        ],
      });
      const [owner, partner] = seeded.participants;
      const [origin, cheap, back] = seeded.looseStands;
      const { reservation, invoice } = await seedLatePartnerReservation({
        festivalId: seeded.festival.id,
        standId: origin.id,
        owner: owner.id,
        partner: partner.id,
      });

      await moveTo(reservation.id, cheap.id);
      const [refund] = await readRefunds(owner.id);
      expect(Number(refund.amount)).toBe(600);
      // 500 of it out of the cobro, 100 out of the late partner's payment.
      expect(
        (refund.metadata as Record<string, string>).latePartnerRefundAmount,
      ).toBe("100");
      expect(
        await integrationDb!.transaction((tx) =>
          latePartnerPrepaidAmount(tx as never, reservation.id),
        ),
      ).toBe(200);
      expect(await tenderOf(invoice.id)).toMatchObject({
        totalAmount: 0,
        refundedAmount: 500,
        coveredAmount: 0,
        outstandingAmount: 0,
      });

      // 800 − (500 + 300 − 600) = 600, all of it asked on the cobro.
      await moveTo(reservation.id, back.id);
      expect((await readReservation(reservation.id)).status).toBe("pending");
      const reopened = await readInvoice(invoice.id);
      expect(Number(reopened.originalAmount)).toBe(600);
      expect(Number(reopened.amount)).toBe(600);
      expect(
        Number((await readReservation(reservation.id)).priceAmountSnapshot),
      ).toBe(600);
      expect(await tenderOf(invoice.id)).toMatchObject({
        coveredAmount: 0,
        outstandingAmount: 600,
      });

      const upload = await paymentService.submitPaymentProof(
        {
          source: "uploadthing",
          invoiceId: invoice.id,
          fileKey: randomUUID(),
          voucherUrl: `https://files.example.com/${randomUUID()}`,
          idempotencyKey: randomUUID(),
        },
        { id: owner.id, role: "user" },
      );
      if (!upload.success) throw new Error(`upload failed: ${upload.message}`);
      const stamped = await integrationDb!
        .select({ amount: payments.amount })
        .from(payments)
        .where(eq(payments.invoiceId, invoice.id));
      expect(
        stamped.map((row) => Number(row.amount)).sort((a, b) => a - b),
      ).toEqual([500, 600]);

      expect(
        await paymentService.approveInvoiceSettlement({
          submissionId: upload.data.submissionId,
        }),
      ).toMatchObject({ success: true });
      expect((await readReservation(reservation.id)).status).toBe("accepted");
      expect((await readInvoice(invoice.id)).status).toBe("paid");
      // Net 500 + 300 + 600 − 600 = 800 for an 800 stand, and the paid cobro
      // shows nothing owed.
      expect(await tenderOf(invoice.id)).toMatchObject({
        totalAmount: 600,
        approvedCashAmount: 1100,
        refundedAmount: 500,
        coveredAmount: 600,
        outstandingAmount: 0,
      });
    });

    it("(c) upgrades it to a 1200 table: the dialog and the service both ask for 400", async () => {
      const seeded = await seedFestival({
        userCount: 2,
        tables: [{ fullTablePrice: 1200, individual: 500, shared: 800 }],
      });
      const [owner, partner] = seeded.participants;
      const [kept, companion] = seeded.tables[0];
      const { reservation, invoice } = await seedLatePartnerReservation({
        festivalId: seeded.festival.id,
        standId: kept.id,
        owner: owner.id,
        partner: partner.id,
      });

      const { preview, result } = await upgradeAsPreviewed(reservation.id);
      expect(preview.plan).toMatchObject({
        toPrice: 1200,
        latePartnerPrepaid: 300,
        grossAmount: 900,
        newInvoiceAmount: 900,
        coveredAmount: 500,
        settlement: { kind: "balance_due", outstandingAmount: 400 },
      });
      expect(result).toMatchObject({
        success: true,
        data: { settlement: { kind: "balance_due", amount: 400 } },
      });

      const upgraded = await readReservation(reservation.id);
      expect(upgraded.status).toBe("pending");
      expect(Number(upgraded.priceAmountSnapshot)).toBe(900);
      expect(Number(upgraded.fullTablePriceSnapshot)).toBe(1200);
      const repriced = await readInvoice(invoice.id);
      expect(Number(repriced.amount)).toBe(900);
      expect(repriced.status).toBe("pending");
      expect(await readStandStatus(kept.id)).toBe("reserved");
      expect(await readStandStatus(companion.id)).toBe("reserved");
    });

    it("prices a downgraded shared half net of a late partner added to the table", async () => {
      // A partner added to the full table before the fee-only rule, who paid
      // the Bs300 shared difference. The table's cobro is still unpaid.
      const seeded = await seedFestival({
        userCount: 2,
        tables: [{ fullTablePrice: 1200, individual: 500, shared: 800 }],
      });
      const [owner, partner] = seeded.participants;
      const [kept, companion] = seeded.tables[0];
      const { reservation, invoice } = await seedReservation({
        festivalId: seeded.festival.id,
        standIds: [kept.id, companion.id],
        ownerUserId: owner.id,
        participantUserIds: [owner.id, partner.id],
        price: 1200,
        individualPrice: 500,
        sharedPrice: 800,
        fullTablePrice: 1200,
      });
      await seedLatePartner({
        festivalId: seeded.festival.id,
        reservationId: reservation.id,
        ownerUserId: owner.id,
        partnerUserId: partner.id,
        difference: 300,
      });

      expect(
        await downgradeFullTableReservation({
          reservationId: reservation.id,
          idempotencyKey: randomUUID(),
        }),
      ).toMatchObject({ success: true });

      // The shared half is 800, of which 300 is already paid.
      const repriced = await readInvoice(invoice.id);
      expect(Number(repriced.originalAmount)).toBe(500);
      expect(Number(repriced.amount)).toBe(500);
      const downgraded = await readReservation(reservation.id);
      expect(Number(downgraded.priceAmountSnapshot)).toBe(500);
      expect(downgraded.fullTablePriceSnapshot).toBeNull();
    });

    it("nets the late partner's payment when an admin removes the partner or adds another", async () => {
      const seeded = await seedFestival({
        userCount: 3,
        looseStands: [{ individual: 500, shared: 800 }],
      });
      const [owner, partner, replacement] = seeded.participants;
      const { reservation, invoice } = await seedLatePartnerReservation({
        festivalId: seeded.festival.id,
        standId: seeded.looseStands[0].id,
        owner: owner.id,
        partner: partner.id,
        paid: false,
      });

      // Alone again: the individual 500 less the 300 already paid.
      expect(
        await updateReservationPartner({
          reservationId: reservation.id,
          partnerUserId: null,
        }),
      ).toMatchObject({ success: true });
      const removed = await readInvoice(invoice.id);
      expect(Number(removed.originalAmount)).toBe(200);
      expect(Number(removed.amount)).toBe(200);
      const alone = await readReservation(reservation.id);
      expect(alone.bookedParticipantCount).toBe(1);
      expect(Number(alone.priceAmountSnapshot)).toBe(200);

      // Two people again: the shared 800 less the same 300 — back to the 500
      // the cobro started at. Before the netting a partner edit on a late
      // partner's reservation repriced it to the full 800.
      expect(
        await updateReservationPartner({
          reservationId: reservation.id,
          partnerUserId: replacement.id,
        }),
      ).toMatchObject({ success: true });
      const readded = await readInvoice(invoice.id);
      expect(Number(readded.originalAmount)).toBe(500);
      expect(Number(readded.amount)).toBe(500);
      const shared = await readReservation(reservation.id);
      expect(shared.bookedParticipantCount).toBe(2);
      expect(Number(shared.priceAmountSnapshot)).toBe(500);
    });
  });

  describe("a reprice that leaves a waiting reservation fully paid accepts it", () => {
    it("accepts a pending reservation its credits exactly cover after a move", async () => {
      const seeded = await seedFestival({
        userCount: 1,
        looseStands: [{ individual: 500 }, { individual: 300 }],
      });
      const owner = seeded.participants[0];
      const [origin, destination] = seeded.looseStands;
      const { reservation, invoice } = await seedReservation({
        festivalId: seeded.festival.id,
        standIds: [origin.id],
        ownerUserId: owner.id,
        price: 500,
      });
      await allocateCredits({
        invoiceId: invoice.id,
        userId: owner.id,
        amount: 300,
      });
      await openPaymentTask(reservation.id, owner.id);

      expect(
        await changeReservationStand({
          reservationId: reservation.id,
          destinationStandId: destination.id,
          idempotencyKey: randomUUID(),
        }),
      ).toMatchObject({ success: true });

      // Before, it sat at pending with Bs0 outstanding and no way to confirm.
      expect((await readReservation(reservation.id)).status).toBe("accepted");
      const accepted = await readInvoice(invoice.id);
      expect(Number(accepted.amount)).toBe(300);
      expect(accepted.status).toBe("paid");
      expect(await readStandStatus(destination.id)).toBe("confirmed");
      expect(await readStandStatus(origin.id)).toBe("available");
      const tasks = await readTasks(reservation.id);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].completedAt).not.toBeNull();
      expect(await readRefunds(owner.id)).toHaveLength(0);

      const events = await readEvents(reservation.id);
      expect(events.map((event) => event.eventType)).toContain(
        "settlement_approved",
      );
      const switched = events.find(
        (event) =>
          (event.payload as { action?: string } | null)?.action ===
          "stand_switched",
      );
      expect(switched).toMatchObject({
        fromStatus: "pending",
        toStatus: "accepted",
      });
    });

    it("confirms again a paid reservation moved to a pricier stand and back", async () => {
      const seeded = await seedFestival({
        userCount: 1,
        looseStands: [{ individual: 300 }, { individual: 500 }],
      });
      const owner = seeded.participants[0];
      const [origin, dearer] = seeded.looseStands;
      const { reservation, invoice } = await seedReservation({
        festivalId: seeded.festival.id,
        standIds: [origin.id],
        ownerUserId: owner.id,
        status: "accepted",
        price: 300,
        standStatus: "confirmed",
        invoiceStatus: "paid",
      });
      await payInvoice({
        invoiceId: invoice.id,
        amount: 300,
        userId: owner.id,
      });

      await changeReservationStand({
        reservationId: reservation.id,
        destinationStandId: dearer.id,
        idempotencyKey: randomUUID(),
      });
      expect((await readReservation(reservation.id)).status).toBe("pending");

      // The admin undoes the mistake: 300 covered against a 300 stand.
      expect(
        await changeReservationStand({
          reservationId: reservation.id,
          destinationStandId: origin.id,
          idempotencyKey: randomUUID(),
        }),
      ).toMatchObject({ success: true });
      expect((await readReservation(reservation.id)).status).toBe("accepted");
      expect((await readInvoice(invoice.id)).status).toBe("paid");
      expect(await readStandStatus(origin.id)).toBe("confirmed");
      expect(await readStandStatus(dearer.id)).toBe("available");
      expect(
        (await readTasks(reservation.id)).filter((t) => t.completedAt == null),
      ).toHaveLength(0);
    });

    it("accepts a pending half the table leaves exactly paid, confirming both halves", async () => {
      const seeded = await seedFestival({
        userCount: 1,
        tables: [{ fullTablePrice: 450, individual: 500 }],
      });
      const owner = seeded.participants[0];
      const [kept, companion] = seeded.tables[0];
      const { reservation, invoice } = await seedReservation({
        festivalId: seeded.festival.id,
        standIds: [kept.id],
        ownerUserId: owner.id,
        price: 500,
      });
      await allocateCredits({
        invoiceId: invoice.id,
        userId: owner.id,
        amount: 450,
      });
      await openPaymentTask(reservation.id, owner.id);

      const { preview, result } = await upgradeAsPreviewed(reservation.id);
      expect(preview.plan).toMatchObject({
        settlement: { kind: "none" },
        completesAcceptance: true,
      });
      expect(result).toMatchObject({
        success: true,
        data: { settlement: { kind: "none", amount: 0 }, accepted: true },
        message:
          "La reserva ahora ocupa la mesa completa. Lo ya pagado cubre la mesa, así que quedó confirmada.",
      });
      expect((await readReservation(reservation.id)).status).toBe("accepted");
      expect((await readInvoice(invoice.id)).status).toBe("paid");
      expect(await readStandStatus(kept.id)).toBe("confirmed");
      expect(await readStandStatus(companion.id)).toBe("confirmed");
      const tasks = await readTasks(reservation.id);
      expect(tasks.every((task) => task.completedAt != null)).toBe(true);
      const upgraded = (await readEvents(reservation.id)).find(
        (event) =>
          (event.payload as { action?: string } | null)?.action ===
          "full_table_manually_upgraded",
      );
      expect(upgraded).toMatchObject({
        fromStatus: "pending",
        toStatus: "accepted",
      });
    });

    it("lets an admin confirm a row an older reprice left pending with nothing outstanding", async () => {
      // The state the reprice used to leave behind: pending, the cobro fully
      // covered by approved cash plus a leftover unapproved voucher, nothing
      // in review. "Confirmar reserva" failed on it with CONFLICT_RETRY.
      const seeded = await seedFestival({
        userCount: 1,
        looseStands: [{ individual: 300 }],
      });
      const owner = seeded.participants[0];
      const [stand] = seeded.looseStands;
      const { reservation, invoice } = await seedReservation({
        festivalId: seeded.festival.id,
        standIds: [stand.id],
        ownerUserId: owner.id,
        price: 300,
      });
      await payInvoice({
        invoiceId: invoice.id,
        amount: 300,
        userId: owner.id,
      });
      await integrationDb!.insert(payments).values({
        amount: 200,
        date: new Date(),
        invoiceId: invoice.id,
        voucherUrl: "/img/leftover.png",
        fileKey: randomUUID(),
      });
      await openPaymentTask(reservation.id, owner.id);

      expect(
        await paymentService.adminConfirmReservation({
          invoiceId: invoice.id,
          idempotencyKey: randomUUID(),
        }),
      ).toMatchObject({ success: true });
      expect((await readReservation(reservation.id)).status).toBe("accepted");
      expect((await readInvoice(invoice.id)).status).toBe("paid");
      expect(await readStandStatus(stand.id)).toBe("confirmed");
      expect(
        (await readTasks(reservation.id)).every((t) => t.completedAt != null),
      ).toBe(true);
    });

    /**
     * The shortcut's `outstanding == 0` also reads 0 on a cobro paid beyond
     * its amount (the outstanding is clamped), and accepting it locked the
     * surplus in: the cobro turned paid and "Devolver créditos" refused.
     */
    it("refuses to confirm a cobro a partner removal left paid beyond its amount, and writes nothing", async () => {
      const seeded = await seedFestival({
        userCount: 2,
        looseStands: [{ individual: 500, shared: 800 }],
      });
      const [owner, partner] = seeded.participants;
      const [stand] = seeded.looseStands;
      const { reservation, invoice } = await seedReservation({
        festivalId: seeded.festival.id,
        standIds: [stand.id],
        ownerUserId: owner.id,
        participantUserIds: [owner.id, partner.id],
        price: 800,
        individualPrice: 500,
        sharedPrice: 800,
      });
      await allocateCredits({
        invoiceId: invoice.id,
        userId: owner.id,
        amount: 700,
      });

      // Alone again: the pending cobro drops to 500 under 700 of credits.
      expect(
        await updateReservationPartner({
          reservationId: reservation.id,
          partnerUserId: null,
        }),
      ).toMatchObject({ success: true });
      expect(await tenderOf(invoice.id)).toMatchObject({
        totalAmount: 500,
        coveredAmount: 700,
        outstandingAmount: 0,
      });

      const result = await paymentService.adminConfirmReservation({
        invoiceId: invoice.id,
        idempotencyKey: randomUUID(),
      });
      expect(result).toMatchObject({
        success: false,
        code: "PAYMENT_AMOUNT_MISMATCH",
      });
      expect(result.message).toContain(
        "Lo pagado (Bs700) supera el monto del cobro (Bs500)",
      );

      expect((await readReservation(reservation.id)).status).toBe("pending");
      const untouched = await readInvoice(invoice.id);
      expect(untouched.status).toBe("pending");
      expect(Number(untouched.amount)).toBe(500);
      expect(await readStandStatus(stand.id)).toBe("reserved");
      expect(
        await integrationDb!
          .select({ id: invoiceSettlementSubmissions.id })
          .from(invoiceSettlementSubmissions)
          .where(eq(invoiceSettlementSubmissions.invoiceId, invoice.id)),
      ).toHaveLength(0);
      expect(
        (await readEvents(reservation.id)).map((event) => event.eventType),
      ).not.toContain("settlement_approved");

      // The surplus can still be handed back, which a paid cobro refuses.
      expect(
        await paymentService.releaseInvoiceCredits({
          invoiceId: invoice.id,
          reason: "Sobraban créditos",
          idempotencyKey: randomUUID(),
        }),
      ).toMatchObject({ success: true });
    });

    it("accepts a pending reservation it overpays, and refunds the surplus once", async () => {
      const seeded = await seedFestival({
        userCount: 1,
        looseStands: [{ individual: 500 }, { individual: 300 }],
      });
      const owner = seeded.participants[0];
      const [origin, destination] = seeded.looseStands;
      const { reservation, invoice } = await seedReservation({
        festivalId: seeded.festival.id,
        standIds: [origin.id],
        ownerUserId: owner.id,
        price: 500,
      });
      await allocateCredits({
        invoiceId: invoice.id,
        userId: owner.id,
        amount: 400,
      });
      const key = randomUUID();

      for (let attempt = 0; attempt < 2; attempt += 1) {
        expect(
          await changeReservationStand({
            reservationId: reservation.id,
            destinationStandId: destination.id,
            idempotencyKey: key,
          }),
        ).toMatchObject({ success: true });
      }

      expect((await readReservation(reservation.id)).status).toBe("accepted");
      expect((await readInvoice(invoice.id)).status).toBe("paid");
      expect(
        (await readRefunds(owner.id)).map((row) => Number(row.amount)),
      ).toEqual([100]);
    });
  });

  describe("free-confirmed reservations and write-offs", () => {
    it("reopens an accepted zero-value reservation moved to a pricier stand for the difference", async () => {
      const seeded = await seedFestival({
        userCount: 1,
        looseStands: [{ individual: 300 }, { individual: 450 }],
      });
      const owner = seeded.participants[0];
      const [origin, destination] = seeded.looseStands;
      const { reservation, invoice } = await seedReservation({
        festivalId: seeded.festival.id,
        standIds: [origin.id],
        ownerUserId: owner.id,
        status: "accepted",
        price: 300,
        discountAmount: 300,
        standStatus: "confirmed",
        invoiceStatus: "paid",
      });
      await integrationDb!.insert(invoiceSettlementSubmissions).values({
        invoiceId: invoice.id,
        kind: "zero_value_entitlement",
        status: "approved",
        uploadedByUserId: owner.id,
        reviewedByUserId: owner.id,
        reviewedAt: new Date(),
      });

      expect(
        await changeReservationStand({
          reservationId: reservation.id,
          destinationStandId: destination.id,
          idempotencyKey: randomUUID(),
        }),
      ).toMatchObject({ success: true });

      expect((await readReservation(reservation.id)).status).toBe("pending");
      const reopened = await readInvoice(invoice.id);
      expect(Number(reopened.discountAmount)).toBe(300);
      expect(Number(reopened.amount)).toBe(150);
      expect(reopened.status).toBe("pending");
      expect(await readStandStatus(destination.id)).toBe("reserved");
      const open = (await readTasks(reservation.id)).filter(
        (task) => task.completedAt == null,
      );
      expect(open).toHaveLength(1);
      expect(open[0].profileId).toBe(owner.id);
    });

    it("reopens an accepted reservation whose zero-value entitlement was approved, even on a positive cobro", async () => {
      // A command that moves no money (the downgrade) can raise the cobro
      // after the entitlement; the reservation was still confirmed for free.
      const seeded = await seedFestival({
        userCount: 1,
        looseStands: [{ individual: 300 }, { individual: 450 }],
      });
      const owner = seeded.participants[0];
      const [origin, destination] = seeded.looseStands;
      const { reservation, invoice } = await seedReservation({
        festivalId: seeded.festival.id,
        standIds: [origin.id],
        ownerUserId: owner.id,
        status: "accepted",
        price: 300,
        standStatus: "confirmed",
        invoiceStatus: "paid",
      });
      await integrationDb!.insert(invoiceSettlementSubmissions).values({
        invoiceId: invoice.id,
        kind: "zero_value_entitlement",
        status: "approved",
        uploadedByUserId: owner.id,
        reviewedByUserId: owner.id,
        reviewedAt: new Date(),
      });

      expect(
        await changeReservationStand({
          reservationId: reservation.id,
          destinationStandId: destination.id,
          idempotencyKey: randomUUID(),
        }),
      ).toMatchObject({ success: true });

      expect((await readReservation(reservation.id)).status).toBe("pending");
      const reopened = await readInvoice(invoice.id);
      expect(Number(reopened.amount)).toBe(450);
      expect(reopened.status).toBe("pending");
      expect(await readStandStatus(destination.id)).toBe("reserved");
    });

    /**
     * Dennis's rule is for reservations confirmed at no cost. A positive cobro
     * marked paid with no payment rows was paid outside the system: it keeps
     * the pre-batch behaviour — repriced, never reopened, never refunded.
     */
    it("only reprices an accepted cobro marked paid with no payment rows, up or down", async () => {
      const seeded = await seedFestival({
        userCount: 1,
        looseStands: [
          { individual: 300 },
          { individual: 450 },
          { individual: 200 },
        ],
      });
      const owner = seeded.participants[0];
      const [origin, dearer, cheaper] = seeded.looseStands;
      const { reservation, invoice } = await seedReservation({
        festivalId: seeded.festival.id,
        standIds: [origin.id],
        ownerUserId: owner.id,
        status: "accepted",
        price: 300,
        standStatus: "confirmed",
        invoiceStatus: "paid",
      });

      expect(
        await changeReservationStand({
          reservationId: reservation.id,
          destinationStandId: dearer.id,
          idempotencyKey: randomUUID(),
        }),
      ).toMatchObject({ success: true });
      expect((await readReservation(reservation.id)).status).toBe("accepted");
      const up = await readInvoice(invoice.id);
      expect(Number(up.amount)).toBe(450);
      expect(up.status).toBe("paid");
      expect(await readStandStatus(dearer.id)).toBe("confirmed");
      expect(
        (await readTasks(reservation.id)).filter(
          (task) => task.completedAt == null,
        ),
      ).toHaveLength(0);

      expect(
        await changeReservationStand({
          reservationId: reservation.id,
          destinationStandId: cheaper.id,
          idempotencyKey: randomUUID(),
        }),
      ).toMatchObject({ success: true });
      expect((await readReservation(reservation.id)).status).toBe("accepted");
      const down = await readInvoice(invoice.id);
      expect(Number(down.amount)).toBe(200);
      expect(down.status).toBe("paid");
      expect(await readRefunds(owner.id)).toHaveLength(0);
    });

    it("keeps a write-off on a move to a cheaper stand: no reopen, the surplus back", async () => {
      // Cobro 500, 300 paid, 200 waived with "confirmar con saldo pendiente".
      const seeded = await seedFestival({
        userCount: 1,
        looseStands: [
          { individual: 500 },
          { individual: 400 },
          { individual: 600 },
        ],
      });
      const owner = seeded.participants[0];
      const [origin, cheaper, dearer] = seeded.looseStands;
      const { reservation, invoice } = await seedReservation({
        festivalId: seeded.festival.id,
        standIds: [origin.id],
        ownerUserId: owner.id,
        status: "accepted",
        price: 500,
        invoiceAmount: 300,
        standStatus: "confirmed",
        invoiceStatus: "paid",
      });
      await payInvoice({
        invoiceId: invoice.id,
        amount: 300,
        userId: owner.id,
      });

      expect(
        await changeReservationStand({
          reservationId: reservation.id,
          destinationStandId: cheaper.id,
          idempotencyKey: randomUUID(),
        }),
      ).toMatchObject({ success: true });

      // 400 less the fixed 200 concession is 200, against 300 paid.
      expect((await readReservation(reservation.id)).status).toBe("accepted");
      const moved = await readInvoice(invoice.id);
      expect(Number(moved.originalAmount)).toBe(400);
      expect(Number(moved.amount)).toBe(200);
      expect(moved.status).toBe("paid");
      expect(await readStandStatus(cheaper.id)).toBe("confirmed");
      expect(
        (await readRefunds(owner.id)).map((row) => Number(row.amount)),
      ).toEqual([100]);

      // Moving up afterwards asks for the price difference only: 600 - 200
      // waived = 400, against the 200 still covered after the refund.
      expect(
        await changeReservationStand({
          reservationId: reservation.id,
          destinationStandId: dearer.id,
          idempotencyKey: randomUUID(),
        }),
      ).toMatchObject({ success: true });
      const reopened = await readInvoice(invoice.id);
      expect(Number(reopened.originalAmount)).toBe(600);
      expect(Number(reopened.amount)).toBe(400);
      expect(reopened.status).toBe("pending");
      expect((await readReservation(reservation.id)).status).toBe("pending");
    });
  });

  describe("a write-off below the new price survives the round trip", () => {
    /**
     * The row's own write-off (original − discount − amount) shrinks when a
     * reprice clamps the amount at 0: Bs200 waived, moved to a Bs150 stand,
     * read back as Bs150 and asked Bs350 on the way back up. The command's
     * own event keeps the whole Bs200.
     */
    it("keeps the whole Bs200 the command waived through a Bs150 stand and back", async () => {
      const seeded = await seedFestival({
        userCount: 1,
        looseStands: [
          { individual: 500 },
          { individual: 150 },
          { individual: 500 },
        ],
      });
      const owner = seeded.participants[0];
      const [origin, cheap, back] = seeded.looseStands;
      const { reservation, invoice } = await seedReservation({
        festivalId: seeded.festival.id,
        standIds: [origin.id],
        ownerUserId: owner.id,
        price: 500,
      });
      await payInvoice({
        invoiceId: invoice.id,
        amount: 300,
        userId: owner.id,
      });
      await openPaymentTask(reservation.id, owner.id);

      // Produced by the command, not seeded: its event is what survives.
      expect(
        await paymentService.settleInvoiceShortfall({
          invoiceId: invoice.id,
          reason: "Acordado con el participante",
          idempotencyKey: randomUUID(),
        }),
      ).toMatchObject({ success: true, data: { writtenOffAmount: 200 } });
      const settled = await readInvoice(invoice.id);
      expect(Number(settled.amount)).toBe(300);
      expect(settled.status).toBe("paid");
      expect((await readReservation(reservation.id)).status).toBe("accepted");

      // 150 − 200 waived leaves nothing to pay: all 300 comes back.
      await moveTo(reservation.id, cheap.id);
      const below = await readInvoice(invoice.id);
      expect(Number(below.originalAmount)).toBe(150);
      expect(Number(below.amount)).toBe(0);
      expect(
        (await readRefunds(owner.id)).map((row) => Number(row.amount)),
      ).toEqual([300]);
      expect((await readReservation(reservation.id)).status).toBe("accepted");

      // Back at 500 the deal is what it was: 500 − 200 waived = 300 owed, with
      // the 300 paid already back in the wallet.
      await moveTo(reservation.id, back.id);
      const reopened = await readInvoice(invoice.id);
      expect(Number(reopened.originalAmount)).toBe(500);
      expect(Number(reopened.amount)).toBe(300);
      expect(reopened.status).toBe("pending");
      expect((await readReservation(reservation.id)).status).toBe("pending");
      expect(await tenderOf(invoice.id)).toMatchObject({
        coveredAmount: 0,
        outstandingAmount: 300,
      });
    });
  });

  describe("exchanges reprice the counterpart too", () => {
    /**
     * The counterpart is a pending late-partner reservation with nothing on
     * its cobro, landing on a Bs100/200 stand: the late partner's Bs300 alone
     * overpays it. The credit lock has to come from the counterpart's late
     * partner (or this is a permanent conflict), and the counterpart is
     * accepted with its new stand confirmed.
     */
    it("refunds a counterpart overpaid by its late partner alone and confirms it", async () => {
      const seeded = await seedFestival({
        userCount: 3,
        looseStands: [
          { individual: 100, shared: 200 },
          { individual: 500, shared: 800 },
        ],
      });
      const [sourceOwner, counterpartOwner, partner] = seeded.participants;
      const [sourceStand, counterpartStand] = seeded.looseStands;
      const source = await seedReservation({
        festivalId: seeded.festival.id,
        standIds: [sourceStand.id],
        ownerUserId: sourceOwner.id,
        price: 100,
        individualPrice: 100,
        sharedPrice: 200,
      });
      const counterpart = await seedLatePartnerReservation({
        festivalId: seeded.festival.id,
        standId: counterpartStand.id,
        owner: counterpartOwner.id,
        partner: partner.id,
        paid: false,
      });
      await openPaymentTask(counterpart.reservation.id, counterpartOwner.id);

      await moveTo(source.reservation.id, counterpartStand.id, true);

      // The source only has its amount moved: pending, unpaid, Bs500 now.
      const movedSource = await readReservation(source.reservation.id);
      expect(movedSource.standId).toBe(counterpartStand.id);
      expect(movedSource.status).toBe("pending");
      expect(Number((await readInvoice(source.invoice.id)).amount)).toBe(500);
      expect(await readStandStatus(counterpartStand.id)).toBe("reserved");

      const movedCounterpart = await readReservation(
        counterpart.reservation.id,
      );
      expect(movedCounterpart.standId).toBe(sourceStand.id);
      expect(movedCounterpart.status).toBe("accepted");
      const counterpartInvoice = await readInvoice(counterpart.invoice.id);
      expect(Number(counterpartInvoice.amount)).toBe(0);
      expect(counterpartInvoice.status).toBe("paid");
      expect(await readStandStatus(sourceStand.id)).toBe("confirmed");
      expect(
        (await readRefunds(counterpartOwner.id)).map((row) =>
          Number(row.amount),
        ),
      ).toEqual([100]);
      expect(await readRefunds(sourceOwner.id)).toHaveLength(0);
      expect(
        (await readTasks(counterpart.reservation.id)).every(
          (task) => task.completedAt != null,
        ),
      ).toBe(true);

      const exchanged = (await readEvents(counterpart.reservation.id)).find(
        (event) =>
          (event.payload as { action?: string } | null)?.action ===
          "stand_exchanged",
      );
      expect(exchanged).toMatchObject({
        fromStatus: "pending",
        toStatus: "accepted",
      });
    });

    /**
     * An ownerless counterpart whose cobro a payer holds: the payer has to be
     * in the lock preview, or the aggregate lock turns this into an endless
     * CONFLICT_RETRY instead of the refusal it is.
     */
    it("refuses an overpaid counterpart with no owner, with its own code, and moves nothing", async () => {
      const seeded = await seedFestival({
        userCount: 2,
        looseStands: [{ individual: 300 }, { individual: 500 }],
      });
      const [sourceOwner, payer] = seeded.participants;
      const [sourceStand, counterpartStand] = seeded.looseStands;
      const source = await seedReservation({
        festivalId: seeded.festival.id,
        standIds: [sourceStand.id],
        ownerUserId: sourceOwner.id,
        price: 300,
      });
      const counterpart = await seedReservation({
        festivalId: seeded.festival.id,
        standIds: [counterpartStand.id],
        ownerUserId: null,
        participantUserIds: [],
        invoiceUserId: payer.id,
        status: "accepted",
        price: 500,
        standStatus: "confirmed",
        invoiceStatus: "paid",
      });
      await payInvoice({
        invoiceId: counterpart.invoice.id,
        amount: 500,
        userId: payer.id,
      });

      const result = await changeReservationStand({
        reservationId: source.reservation.id,
        destinationStandId: counterpartStand.id,
        idempotencyKey: randomUUID(),
        allowExchange: true,
      });
      expect(result).toMatchObject({
        success: false,
        code: "STAND_CHANGE_REFUND_NO_OWNER",
      });
      expect((await readReservation(source.reservation.id)).standId).toBe(
        sourceStand.id,
      );
      expect((await readReservation(counterpart.reservation.id)).standId).toBe(
        counterpartStand.id,
      );
      expect(Number((await readInvoice(counterpart.invoice.id)).amount)).toBe(
        500,
      );
      expect(await readRefunds(payer.id)).toHaveLength(0);
      expect(await readRefunds(sourceOwner.id)).toHaveLength(0);
    });
  });

  describe("legacy reservations with no owner", () => {
    it("refuses a refund with nobody to credit, with its own code instead of an endless conflict", async () => {
      const seeded = await seedFestival({
        userCount: 1,
        looseStands: [{ individual: 500 }, { individual: 300 }],
      });
      const payer = seeded.participants[0];
      const [origin, destination] = seeded.looseStands;
      // No owner and no participant rows — the rows the owner backfill skips —
      // with the cobro in a payer's name. Without the payer in the lock
      // preview this failed earlier, as CONFLICT_RETRY, at the aggregate lock.
      const { reservation, invoice } = await seedReservation({
        festivalId: seeded.festival.id,
        standIds: [origin.id],
        ownerUserId: null,
        participantUserIds: [],
        invoiceUserId: payer.id,
        status: "accepted",
        price: 500,
        standStatus: "confirmed",
        invoiceStatus: "paid",
      });
      await payInvoice({
        invoiceId: invoice.id,
        amount: 500,
        userId: payer.id,
      });

      const result = await changeReservationStand({
        reservationId: reservation.id,
        destinationStandId: destination.id,
        idempotencyKey: randomUUID(),
      });
      expect(result).toMatchObject({
        success: false,
        code: "STAND_CHANGE_REFUND_NO_OWNER",
      });
      const untouched = await readReservation(reservation.id);
      expect(untouched.standId).toBe(origin.id);
      expect(Number((await readInvoice(invoice.id)).amount)).toBe(500);
      expect(await readRefunds(payer.id)).toHaveLength(0);
    });

    it("gives a balance reopened with no owner a reminder task held by the cobro's holder", async () => {
      const seeded = await seedFestival({
        userCount: 1,
        looseStands: [{ individual: 300 }, { individual: 450 }],
      });
      const payer = seeded.participants[0];
      const [origin, destination] = seeded.looseStands;
      const { reservation, invoice } = await seedReservation({
        festivalId: seeded.festival.id,
        standIds: [origin.id],
        ownerUserId: null,
        participantUserIds: [],
        invoiceUserId: payer.id,
        status: "accepted",
        price: 300,
        standStatus: "confirmed",
        invoiceStatus: "paid",
      });
      await payInvoice({
        invoiceId: invoice.id,
        amount: 300,
        userId: payer.id,
      });

      expect(
        await changeReservationStand({
          reservationId: reservation.id,
          destinationStandId: destination.id,
          idempotencyKey: randomUUID(),
        }),
      ).toMatchObject({ success: true });

      expect((await readReservation(reservation.id)).status).toBe("pending");
      const open = await integrationDb!
        .select()
        .from(scheduledTasks)
        .where(
          and(
            eq(scheduledTasks.reservationId, reservation.id),
            isNull(scheduledTasks.completedAt),
          ),
        );
      expect(open).toHaveLength(1);
      expect(open[0].profileId).toBe(payer.id);
      expect(open[0].taskType).toBe("stand_reservation");
    });
  });
});
