// @vitest-environment node

import { randomUUID } from "crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
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
  creditAccounts,
  creditLedgerEntries,
  festivalSectors,
  festivals,
  invoiceCreditAllocations,
  invoiceSettlementSubmissions,
  invoices,
  payments,
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
 * Money guards from the post-#551 batch (Dennis, 2026-09-29):
 *
 * - credits handed back from a cobro — by a cancellation or "Devolver
 *   créditos" — are net of what a repricing already refunded from them, so
 *   nobody recovers the same credits twice;
 * - a repricing refund stays netted on the cobro itself, so a reservation
 *   moved back up owes, pays and shows exactly the difference it got back;
 * - the full-table downgrade refuses only on real money, and the edit page
 *   disables it for exactly the same reasons.
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
let downgradeFullTableReservation: (typeof import("@/app/lib/reservations/full-table-service"))["downgradeFullTableReservation"];
let fetchFullTableDowngradeBlocker: (typeof import("@/app/lib/reservations/full-table-downgrade-queries"))["fetchFullTableDowngradeBlocker"];
let fullTableDowngradeDisabledReason: (typeof import("@/app/components/reservations/full-table-downgrade-options"))["fullTableDowngradeDisabledReason"];
let cancelReservation: (typeof import("@/app/lib/reservations/admin-service"))["cancelReservation"];
let standChangeRefundedAmount: (typeof import("@/app/lib/reservations/repricing-refunds"))["standChangeRefundedAmount"];
let creditService: typeof import("@/app/lib/credits/service");
let paymentService: typeof import("@/app/lib/reservations/payment-service");
let fetchReservationsByFestivalId: (typeof import("@/app/lib/reservations/actions"))["fetchReservationsByFestivalId"];
let fetchInvoiceTenderSummary: (typeof import("@/app/data/invoices/actions"))["fetchInvoiceTenderSummary"];
let tenderQueries: typeof import("@/app/lib/payments/tender-queries");
let deriveCoverageState: (typeof import("@/app/lib/payments/coverage"))["deriveCoverageState"];

const ADMIN = { id: 0, role: "admin", status: "verified", category: "none" };

describeDatabase("credit releases and the full-table downgrade", () => {
  beforeAll(async () => {
    // `=` rather than `??=`: a POSTGRES_URL inherited from .env.local must
    // never be the database the app code under test writes to.
    process.env.POSTGRES_URL = testDatabaseUrl!;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";
    ({ changeReservationStand } =
      await import("@/app/lib/reservations/stand-change-service"));
    ({ downgradeFullTableReservation } =
      await import("@/app/lib/reservations/full-table-service"));
    ({ fetchFullTableDowngradeBlocker } =
      await import("@/app/lib/reservations/full-table-downgrade-queries"));
    ({ fullTableDowngradeDisabledReason } =
      await import("@/app/components/reservations/full-table-downgrade-options"));
    ({ cancelReservation } =
      await import("@/app/lib/reservations/admin-service"));
    ({ standChangeRefundedAmount } =
      await import("@/app/lib/reservations/repricing-refunds"));
    creditService = await import("@/app/lib/credits/service");
    paymentService = await import("@/app/lib/reservations/payment-service");
    ({ fetchReservationsByFestivalId } =
      await import("@/app/lib/reservations/actions"));
    ({ fetchInvoiceTenderSummary } =
      await import("@/app/data/invoices/actions"));
    tenderQueries = await import("@/app/lib/payments/tender-queries");
    ({ deriveCoverageState } = await import("@/app/lib/payments/coverage"));
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
      // its user FK is `restrict` — so it goes first, with the trigger dropped
      // only for this delete.
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

  /** One sector: optional declared full tables and loose stands. */
  async function seedFestival(input: {
    looseStands?: Price[];
    tables?: (Price & { fullTablePrice: number })[];
  }) {
    const db = integrationDb!;
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const [festival] = await db
      .insert(festivals)
      .values({
        name: `Money guards ${suffix}`,
        status: "active",
        festivalType: "glitter",
        reservationsStartDate: new Date(Date.now() - 60_000),
      })
      .returning();

    const [admin] = await db
      .insert(users)
      .values({
        clerkId: `mg-admin-${suffix}`,
        email: `mg-admin-${suffix}@example.test`,
        displayName: `MG Admin ${suffix}`,
        status: "verified",
        role: "admin",
      })
      .returning();

    const [owner] = await db
      .insert(users)
      .values({
        clerkId: `mg-${suffix}`,
        email: `mg-${suffix}@example.test`,
        displayName: `MG ${suffix}`,
        status: "verified" as const,
        category: "illustration" as const,
      })
      .returning();

    await db.insert(userRequests).values({
      userId: owner.id,
      festivalId: festival.id,
      type: "festival_participation" as const,
      status: "accepted" as const,
    });

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

    fixtures.push({ festivalId: festival.id, userIds: [admin.id, owner.id] });
    currentProfileMock.mockResolvedValue({ ...ADMIN, id: admin.id });

    return { festival, admin, owner, tables, looseStands };
  }

  /** A live reservation built directly: one stand, or both halves of a table. */
  async function seedReservation(input: {
    festivalId: number;
    standIds: number[];
    ownerUserId: number;
    status?: "pending" | "accepted";
    price: number;
    individualPrice?: number;
    fullTablePrice?: number | null;
  }) {
    const db = integrationDb!;
    const status = input.status ?? "pending";
    const [reservation] = await db
      .insert(standReservations)
      .values({
        festivalId: input.festivalId,
        standId: input.standIds[0],
        status,
        source: "admin_assignment",
        ownerUserId: input.ownerUserId,
        priceAmountSnapshot: input.price,
        individualPriceSnapshot: input.individualPrice ?? input.price,
        sharedPriceSnapshot: null,
        fullTablePriceSnapshot: input.fullTablePrice ?? null,
        bookedParticipantCount: 1,
      })
      .returning();

    await db.insert(standReservationStands).values(
      input.standIds.map((standId, position) => ({
        reservationId: reservation.id,
        standId,
        position,
      })),
    );
    await db.insert(reservationParticipants).values({
      userId: input.ownerUserId,
      reservationId: reservation.id,
    });

    const [invoice] = await db
      .insert(invoices)
      .values({
        date: new Date(),
        userId: input.ownerUserId,
        reservationId: reservation.id,
        originalAmount: input.price,
        discountAmount: 0,
        amount: input.price,
        status: status === "accepted" ? "paid" : "pending",
      })
      .returning();

    await db
      .update(stands)
      .set({ status: status === "accepted" ? "confirmed" : "reserved" })
      .where(inArray(stands.id, input.standIds));

    return { reservation, invoice };
  }

  /** A payment and, unless it is a legacy row, the submission behind it. */
  async function addPayment(input: {
    invoiceId: number;
    amount: number;
    userId: number;
    submission: "approved" | "submitted" | "rejected" | null;
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
    if (input.submission) {
      await db.insert(invoiceSettlementSubmissions).values({
        invoiceId: input.invoiceId,
        paymentId: payment.id,
        kind: "payment_proof",
        status: input.submission,
        uploadedByUserId: input.userId,
        ...(input.submission === "submitted"
          ? {}
          : { reviewedByUserId: input.userId, reviewedAt: new Date() }),
      });
    }
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
    const [allocation] = await db
      .insert(invoiceCreditAllocations)
      .values({
        invoiceId: input.invoiceId,
        userId: input.userId,
        amount: input.amount,
        ledgerEntryId: debit.data.ledgerEntryId,
        idempotencyKey: randomUUID(),
      })
      .returning();
    return allocation;
  }

  /** The wallet as the ledger sums it, checked against the cached balance. */
  async function walletBalance(userId: number) {
    const [ledger] = await integrationDb!
      .select({
        amount: sql<string>`coalesce(sum(${creditLedgerEntries.amount}), 0)`,
      })
      .from(creditLedgerEntries)
      .where(eq(creditLedgerEntries.userId, userId));
    const [account] = await integrationDb!
      .select({ cachedBalance: creditAccounts.cachedBalance })
      .from(creditAccounts)
      .where(eq(creditAccounts.userId, userId));
    const balance = Number(ledger?.amount ?? 0);
    expect(Number(account?.cachedBalance ?? 0)).toBe(balance);
    return balance;
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
      )
      .orderBy(asc(creditLedgerEntries.id));
    return rows.filter(
      (row) =>
        (row.metadata as Record<string, string>)
          .standChangeRefundReservationId != null,
    );
  }

  /** Offsets a release posted against an earlier refund. */
  async function readOffsets(userId: number) {
    const rows = await integrationDb!
      .select()
      .from(creditLedgerEntries)
      .where(
        and(
          eq(creditLedgerEntries.userId, userId),
          eq(creditLedgerEntries.type, "admin_adjustment"),
          sql`${creditLedgerEntries.amount} < 0`,
        ),
      )
      .orderBy(asc(creditLedgerEntries.id));
    return rows.filter(
      (row) =>
        (row.metadata as Record<string, string>)
          .standChangeRefundReservationId != null,
    );
  }

  async function refundedFor(reservationId: number) {
    return integrationDb!.transaction((tx) =>
      standChangeRefundedAmount(tx as never, reservationId),
    );
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

  async function liveMemberStandIds(reservationId: number) {
    const rows = await integrationDb!
      .select({
        standId: standReservationStands.standId,
        releasedAt: standReservationStands.releasedAt,
      })
      .from(standReservationStands)
      .where(eq(standReservationStands.reservationId, reservationId))
      .orderBy(asc(standReservationStands.position));
    return rows.filter((row) => row.releasedAt == null).map((r) => r.standId);
  }

  async function moveTo(reservationId: number, standId: number) {
    const result = await changeReservationStand({
      reservationId,
      destinationStandId: standId,
      idempotencyKey: randomUUID(),
    });
    expect(result).toMatchObject({ success: true });
  }

  describe("credits handed back after a repricing refund", () => {
    it("cancelling a reservation a cheaper move refunded returns only the rest of its credits", async () => {
      const seeded = await seedFestival({
        looseStands: [{ individual: 500 }, { individual: 300 }],
      });
      const { owner } = seeded;
      const [origin, cheaper] = seeded.looseStands;
      const { reservation, invoice } = await seedReservation({
        festivalId: seeded.festival.id,
        standIds: [origin.id],
        ownerUserId: owner.id,
        status: "accepted",
        price: 500,
      });
      await allocateCredits({
        invoiceId: invoice.id,
        userId: owner.id,
        amount: 500,
      });
      expect(await walletBalance(owner.id)).toBe(0);

      await moveTo(reservation.id, cheaper.id);
      expect(
        (await readRefunds(owner.id)).map((row) => Number(row.amount)),
      ).toEqual([200]);
      expect(await walletBalance(owner.id)).toBe(200);

      expect(
        await cancelReservation({ reservationId: reservation.id, reason: "x" }),
      ).toMatchObject({ success: true });

      // Bs500 put in, Bs500 back: Bs200 from the move, Bs300 from the cancel.
      // Releasing the allocation whole left the participant with Bs700.
      expect(await walletBalance(owner.id)).toBe(500);
      expect(
        (await readOffsets(owner.id)).map((row) => Number(row.amount)),
      ).toEqual([-200]);
      expect(await refundedFor(reservation.id)).toBe(0);

      const [released] = await integrationDb!
        .select({ payload: standReservationEvents.payload })
        .from(standReservationEvents)
        .where(
          and(
            eq(standReservationEvents.reservationId, reservation.id),
            sql`${standReservationEvents.payload} ->> 'kind' = 'invoice_credits_released'`,
          ),
        );
      expect(released.payload).toMatchObject({
        returnedAmount: 300,
        refundOffsets: [{ userId: owner.id, amount: 200 }],
      });

      // A second cancel is a no-op, not a second offset.
      expect(
        await cancelReservation({ reservationId: reservation.id, reason: "x" }),
      ).toMatchObject({ success: true });
      expect(await walletBalance(owner.id)).toBe(500);
      expect(await readOffsets(owner.id)).toHaveLength(1);
    });

    it("'Devolver créditos' after a refund returns the rest, and a later move refunds in full", async () => {
      const seeded = await seedFestival({
        looseStands: [
          { individual: 500 },
          { individual: 300 },
          { individual: 600 },
        ],
      });
      const { owner } = seeded;
      const [origin, cheaper, dearer] = seeded.looseStands;
      const { reservation, invoice } = await seedReservation({
        festivalId: seeded.festival.id,
        standIds: [origin.id],
        ownerUserId: owner.id,
        status: "accepted",
        price: 500,
      });
      await allocateCredits({
        invoiceId: invoice.id,
        userId: owner.id,
        amount: 500,
      });

      await moveTo(reservation.id, cheaper.id); // Bs200 back
      await moveTo(reservation.id, dearer.id); // reopened for the difference
      expect((await readReservation(reservation.id)).status).toBe("pending");
      expect((await readInvoice(invoice.id)).status).toBe("pending");

      const result = await paymentService.releaseInvoiceCredits({
        invoiceId: invoice.id,
        reason: "El participante pidió devolución",
        idempotencyKey: randomUUID(),
      });
      expect(result).toMatchObject({
        success: true,
        data: {
          returnedAmount: 300,
          refundOffsets: [{ userId: owner.id, amount: 200 }],
          outstandingAmount: 600,
        },
      });
      expect(result.message).toBe(
        "Devolvimos Bs300 en créditos. Bs200 ya se habían devuelto como diferencia a favor de un cambio de espacio, así que no se devuelven de nuevo. Saldo pendiente: Bs600.",
      );
      expect(await walletBalance(owner.id)).toBe(500);
      expect(await refundedFor(reservation.id)).toBe(0);

      // The netted refund no longer counts against the next repricing. Paid
      // in full again and moved to the Bs300 stand, the whole Bs300 surplus
      // comes back — the stale Bs200 would have cut it to Bs100.
      await allocateCredits({
        invoiceId: invoice.id,
        userId: owner.id,
        amount: 600,
      });
      await moveTo(reservation.id, cheaper.id);
      expect(
        (await readRefunds(owner.id)).map((row) => Number(row.amount)),
      ).toEqual([200, 300]);
      expect((await readReservation(reservation.id)).status).toBe("accepted");
    });

    it("nets a partial release only against what it released", async () => {
      const seeded = await seedFestival({
        looseStands: [
          { individual: 500 },
          { individual: 300 },
          { individual: 600 },
        ],
      });
      const { owner } = seeded;
      const [origin, cheaper, dearer] = seeded.looseStands;
      const { reservation, invoice } = await seedReservation({
        festivalId: seeded.festival.id,
        standIds: [origin.id],
        ownerUserId: owner.id,
        status: "accepted",
        price: 500,
      });
      await allocateCredits({
        invoiceId: invoice.id,
        userId: owner.id,
        amount: 300,
      });
      const small = await allocateCredits({
        invoiceId: invoice.id,
        userId: owner.id,
        amount: 200,
      });

      await moveTo(reservation.id, cheaper.id); // Bs200 back
      await moveTo(reservation.id, dearer.id);

      const first = await paymentService.releaseInvoiceCredits({
        invoiceId: invoice.id,
        allocationId: small.id,
        reason: "parcial",
        idempotencyKey: randomUUID(),
      });
      expect(first).toMatchObject({
        success: true,
        data: {
          returnedAmount: 0,
          refundOffsets: [{ userId: owner.id, amount: 200 }],
        },
      });
      expect(await refundedFor(reservation.id)).toBe(0);

      const second = await paymentService.releaseInvoiceCredits({
        invoiceId: invoice.id,
        reason: "resto",
        idempotencyKey: randomUUID(),
      });
      expect(second).toMatchObject({
        success: true,
        data: { returnedAmount: 300, refundOffsets: [] },
      });
      expect(await walletBalance(owner.id)).toBe(500);
    });

    it("keeps the part of a cash-funded refund the released credits cannot cover", async () => {
      const seeded = await seedFestival({
        looseStands: [{ individual: 500 }, { individual: 200 }],
      });
      const { owner } = seeded;
      const [origin, cheaper] = seeded.looseStands;
      const { reservation, invoice } = await seedReservation({
        festivalId: seeded.festival.id,
        standIds: [origin.id],
        ownerUserId: owner.id,
        status: "accepted",
        price: 500,
      });
      await addPayment({
        invoiceId: invoice.id,
        amount: 400,
        userId: owner.id,
        submission: "approved",
      });
      await allocateCredits({
        invoiceId: invoice.id,
        userId: owner.id,
        amount: 100,
      });

      await moveTo(reservation.id, cheaper.id); // Bs300 back
      expect(await walletBalance(owner.id)).toBe(300);

      expect(
        await cancelReservation({ reservationId: reservation.id, reason: "x" }),
      ).toMatchObject({ success: true });

      // Only the Bs100 of credits is netted; the Bs200 the cash funded stays
      // in the wallet, since a cancellation never hands cash back anyway.
      expect(
        (await readOffsets(owner.id)).map((row) => Number(row.amount)),
      ).toEqual([-100]);
      expect(await walletBalance(owner.id)).toBe(300);
      expect(await refundedFor(reservation.id)).toBe(200);
    });

    it("does not net a refund an admin already reverted from the wallet", async () => {
      const seeded = await seedFestival({
        looseStands: [{ individual: 500 }, { individual: 300 }],
      });
      const { owner, admin } = seeded;
      const [origin, cheaper] = seeded.looseStands;
      const { reservation, invoice } = await seedReservation({
        festivalId: seeded.festival.id,
        standIds: [origin.id],
        ownerUserId: owner.id,
        status: "accepted",
        price: 500,
      });
      await allocateCredits({
        invoiceId: invoice.id,
        userId: owner.id,
        amount: 500,
      });
      await moveTo(reservation.id, cheaper.id);
      const [grant] = await readRefunds(owner.id);
      const reverted = await creditService.adjustCreditAccount({
        userId: owner.id,
        amount: -200,
        reason: "Revertido",
        idempotencyKey: randomUUID(),
        reversesEntryId: grant.id,
        adminUserId: admin.id,
      });
      expect(reverted.ok).toBe(true);
      expect(await refundedFor(reservation.id)).toBe(0);

      expect(
        await cancelReservation({ reservationId: reservation.id, reason: "x" }),
      ).toMatchObject({ success: true });
      expect(await readOffsets(owner.id)).toHaveLength(0);
      expect(await walletBalance(owner.id)).toBe(500);
    });
  });

  describe("a repricing refund stays netted on the cobro", () => {
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

    function actAs(user: { id: number }, role: "user" | "admin") {
      currentProfileMock.mockResolvedValue({
        id: user.id,
        role,
        status: "verified",
        category: role === "admin" ? "none" : "illustration",
      });
    }

    async function uploadProof(invoiceId: number, ownerId: number) {
      return paymentService.submitPaymentProof(
        {
          source: "uploadthing",
          invoiceId,
          fileKey: randomUUID(),
          voucherUrl: `https://files.example.com/${randomUUID()}`,
          idempotencyKey: randomUUID(),
        },
        { id: ownerId, role: "user" },
      );
    }

    /** Bs500 paid (cash or credits), moved to a Bs300 stand: Bs200 back. */
    async function seedRefunded(input: {
      tender: "cash" | "credits";
      backPrice: number;
    }) {
      const seeded = await seedFestival({
        looseStands: [
          { individual: 500 },
          { individual: 300 },
          { individual: input.backPrice },
        ],
      });
      const { owner } = seeded;
      const [origin, cheaper, back] = seeded.looseStands;
      const { reservation, invoice } = await seedReservation({
        festivalId: seeded.festival.id,
        standIds: [origin.id],
        ownerUserId: owner.id,
        status: "accepted",
        price: 500,
      });
      if (input.tender === "cash") {
        await addPayment({
          invoiceId: invoice.id,
          amount: 500,
          userId: owner.id,
          submission: "approved",
        });
      } else {
        await allocateCredits({
          invoiceId: invoice.id,
          userId: owner.id,
          amount: 500,
        });
      }
      await moveTo(reservation.id, cheaper.id);
      return { ...seeded, reservation, invoice, back };
    }

    /**
     * 500 → 300 → 500. The plan owed Bs200 and reopened the reservation, but
     * the cobro's own tender still read Bs500 paid, so it showed Bs0 to pay:
     * the participant could not pay and "Confirmar reserva" accepted it free.
     */
    it("asks for the refunded difference when a reservation moves back up, and a proof for it confirms", async () => {
      const { owner, admin, reservation, invoice, back } = await seedRefunded({
        tender: "cash",
        backPrice: 500,
      });
      expect(await walletBalance(owner.id)).toBe(200);
      // On the cheaper stand the cobro is exactly covered, not over-allocated.
      expect(await tenderOf(invoice.id)).toMatchObject({
        totalAmount: 300,
        approvedCashAmount: 500,
        refundedAmount: 200,
        coveredAmount: 300,
        outstandingAmount: 0,
      });

      await moveTo(reservation.id, back.id);
      expect((await readReservation(reservation.id)).status).toBe("pending");
      expect((await readInvoice(invoice.id)).status).toBe("pending");
      expect(await tenderOf(invoice.id)).toMatchObject({
        totalAmount: 500,
        approvedCashAmount: 500,
        refundedAmount: 200,
        coveredAmount: 300,
        outstandingAmount: 200,
      });

      // The participant's own payment screen says the same.
      actAs(owner, "user");
      expect(await fetchInvoiceTenderSummary(invoice.id)).toEqual({
        approvedCashAmount: 500,
        confirmedCreditAmount: 0,
        refundedAmount: 200,
        outstandingAmount: 200,
      });

      const upload = await uploadProof(invoice.id, owner.id);
      if (!upload.success) throw new Error(`upload failed: ${upload.message}`);
      const proofPayment = await integrationDb!
        .select({ amount: payments.amount })
        .from(payments)
        .where(eq(payments.invoiceId, invoice.id))
        .orderBy(asc(payments.id));
      // Stamped with the balance, not Bs0 (which used to refuse outright).
      expect(proofPayment.map((row) => Number(row.amount))).toEqual([500, 200]);

      actAs(admin, "admin");
      expect(
        await paymentService.approveInvoiceSettlement({
          submissionId: upload.data.submissionId,
        }),
      ).toMatchObject({ success: true });
      expect((await readReservation(reservation.id)).status).toBe("accepted");
      expect((await readInvoice(invoice.id)).status).toBe("paid");
      const [stand] = await integrationDb!
        .select({ status: stands.status })
        .from(stands)
        .where(eq(stands.id, back.id));
      expect(stand.status).toBe("confirmed");
      expect(await tenderOf(invoice.id)).toMatchObject({
        approvedCashAmount: 700,
        refundedAmount: 200,
        coveredAmount: 500,
        outstandingAmount: 0,
      });
    });

    it("asks for the whole Bs300 on a move from the refunded Bs300 stand to a Bs600 one", async () => {
      const { reservation, invoice, back } = await seedRefunded({
        tender: "cash",
        backPrice: 600,
      });

      await moveTo(reservation.id, back.id);
      // 600 less the 300 still paying the cobro — not 600 less the 500 the
      // rows remember.
      expect(await tenderOf(invoice.id)).toMatchObject({
        totalAmount: 600,
        refundedAmount: 200,
        coveredAmount: 300,
        outstandingAmount: 300,
      });
      expect((await readReservation(reservation.id)).status).toBe("pending");
    });

    it("lets credits pay the reopened difference, and a later cancel returns exactly what was put in", async () => {
      const { owner, admin, reservation, invoice, back } = await seedRefunded({
        tender: "credits",
        backPrice: 500,
      });
      expect(await walletBalance(owner.id)).toBe(200);

      await moveTo(reservation.id, back.id);
      expect(await tenderOf(invoice.id)).toMatchObject({
        confirmedCreditAmount: 500,
        refundedAmount: 200,
        outstandingAmount: 200,
      });

      // The participant spends the refund on the balance it left.
      actAs(owner, "user");
      expect(
        await paymentService.applyInvoiceCredits({
          invoiceId: invoice.id,
          idempotencyKey: randomUUID(),
        }),
      ).toMatchObject({
        success: true,
        data: { amount: 200, outstandingAmount: 0 },
      });
      expect(await walletBalance(owner.id)).toBe(0);
      expect((await readReservation(reservation.id)).status).toBe("accepted");
      expect((await readInvoice(invoice.id)).status).toBe("paid");
      expect(await tenderOf(invoice.id)).toMatchObject({
        confirmedCreditAmount: 700,
        refundedAmount: 200,
        coveredAmount: 500,
        outstandingAmount: 0,
      });

      // Bs700 of allocations released, the Bs200 refund netted out of them
      // (item 4): Bs500 back, the Bs500 the participant ever put in.
      actAs(admin, "admin");
      expect(
        await cancelReservation({ reservationId: reservation.id, reason: "x" }),
      ).toMatchObject({ success: true });
      expect(await walletBalance(owner.id)).toBe(500);
      expect(
        (await readOffsets(owner.id)).map((row) => Number(row.amount)),
      ).toEqual([-200]);
      expect(await refundedFor(reservation.id)).toBe(0);
    });

    it("keeps 'Confirmar reserva' from accepting a reopened difference nobody paid, and the console shows it owed", async () => {
      const { festival, reservation, invoice, back } = await seedRefunded({
        tender: "cash",
        backPrice: 500,
      });
      await moveTo(reservation.id, back.id);

      // Nothing in review and the rows cover Bs500 — the shortcut used to
      // accept here for free.
      expect(
        await paymentService.adminConfirmReservation({
          invoiceId: invoice.id,
          idempotencyKey: randomUUID(),
        }),
      ).toMatchObject({ success: false, code: "INVOICE_NOT_PENDING" });
      expect((await readReservation(reservation.id)).status).toBe("pending");
      expect((await readInvoice(invoice.id)).status).toBe("pending");

      // The admin console reads the same net figures.
      const rows = await fetchReservationsByFestivalId(festival.id);
      const row = rows.find((candidate) => candidate.id === reservation.id);
      expect(row?.tender).toMatchObject({
        totalAmount: 500,
        approvedCashAmount: 500,
        refundedAmount: 200,
        coveredAmount: 300,
        outstandingAmount: 200,
      });
      expect(
        deriveCoverageState({
          invoiceStatus: "pending",
          reservationStatus: "pending",
          tender: row!.tender!,
          dueAt: null,
        }),
      ).toBe("partial");
    });

    /**
     * `settleInvoiceShortfall` reads the net tender now: on a cobro reopened
     * after a refund it used to see nothing outstanding and refuse. It waives
     * exactly the refunded difference, and the waiver is a concession later
     * moves carry.
     */
    it("lets 'Confirmar con saldo pendiente' waive a reopened difference, and a later move keeps the waiver", async () => {
      const { owner, admin, reservation, invoice, back, looseStands } =
        await seedRefunded({ tender: "cash", backPrice: 500 });
      const cheaper = looseStands[1];
      await moveTo(reservation.id, back.id);
      expect(await tenderOf(invoice.id)).toMatchObject({
        coveredAmount: 300,
        outstandingAmount: 200,
      });

      actAs(admin, "admin");
      expect(
        await paymentService.settleInvoiceShortfall({
          invoiceId: invoice.id,
          reason: "Acordado con el participante",
          idempotencyKey: randomUUID(),
        }),
      ).toMatchObject({ success: true, data: { writtenOffAmount: 200 } });
      const settled = await readInvoice(invoice.id);
      expect(Number(settled.originalAmount)).toBe(500);
      expect(Number(settled.amount)).toBe(300);
      expect(settled.status).toBe("paid");
      expect((await readReservation(reservation.id)).status).toBe("accepted");
      expect(await tenderOf(invoice.id)).toMatchObject({
        totalAmount: 300,
        refundedAmount: 200,
        coveredAmount: 300,
        outstandingAmount: 0,
      });

      // Back on the Bs300 stand: 300 − 200 waived = 100, against the 300 still
      // paying the cobro — Bs200 more comes back, and nothing reopens.
      await moveTo(reservation.id, cheaper.id);
      const moved = await readInvoice(invoice.id);
      expect(Number(moved.originalAmount)).toBe(300);
      expect(Number(moved.amount)).toBe(100);
      expect(moved.status).toBe("paid");
      expect(
        (await readRefunds(owner.id)).map((row) => Number(row.amount)),
      ).toEqual([200, 200]);
      expect((await readReservation(reservation.id)).status).toBe("accepted");
      expect(await tenderOf(invoice.id)).toMatchObject({
        coveredAmount: 100,
        outstandingAmount: 0,
      });
    });

    /**
     * No schema rule stops a second live cobro, so the refund is attributed
     * deterministically — in id order, each up to its own tender — whichever
     * cobros a reader asks about.
     */
    it("attributes a refund across two live cobros the same way from any reader", async () => {
      const seeded = await seedFestival({ looseStands: [{ individual: 500 }] });
      const { owner } = seeded;
      const { reservation, invoice: first } = await seedReservation({
        festivalId: seeded.festival.id,
        standIds: [seeded.looseStands[0].id],
        ownerUserId: owner.id,
        status: "accepted",
        price: 100,
      });
      const [second, cancelled] = await integrationDb!
        .insert(invoices)
        .values(
          (["paid", "cancelled"] as const).map((status) => ({
            date: new Date(),
            userId: owner.id,
            reservationId: reservation.id,
            originalAmount: 500,
            amount: 500,
            status,
          })),
        )
        .returning();
      for (const [invoice, amount] of [
        [first, 100],
        [second, 500],
        [cancelled, 500],
      ] as const) {
        await addPayment({
          invoiceId: invoice.id,
          amount,
          userId: owner.id,
          submission: "approved",
        });
      }
      const granted = await integrationDb!.transaction((tx) =>
        creditService.grantCreditsInTx(tx as never, {
          userId: owner.id,
          amount: 300,
          reason: "fixture refund",
          idempotencyKey: randomUUID(),
          metadata: { standChangeRefundReservationId: String(reservation.id) },
        }),
      );
      expect(granted).not.toBeNull();

      // Asked about alone, the second cobro still leaves the first its share.
      const alone = await tenderQueries.fetchInvoiceTenders(
        [second.id],
        new Map([[second.id, 500]]),
      );
      expect(alone.get(second.id)).toMatchObject({
        refundedAmount: 200,
        coveredAmount: 300,
      });
      expect(await tenderOf(first.id)).toMatchObject({
        refundedAmount: 100,
        coveredAmount: 0,
      });
      // A cancelled cobro is history and nets nothing.
      expect(await tenderOf(cancelled.id)).toMatchObject({
        refundedAmount: 0,
        coveredAmount: 500,
      });

      // All three together agree with each reader on its own.
      const together = await tenderQueries.fetchInvoiceTenders(
        [first.id, second.id, cancelled.id],
        new Map([
          [first.id, 100],
          [second.id, 500],
          [cancelled.id, 500],
        ]),
      );
      expect(
        [first.id, second.id, cancelled.id].map(
          (id) => together.get(id)?.refundedAmount,
        ),
      ).toEqual([100, 200, 0]);
    });
  });

  describe("the full-table downgrade refuses only on real money", () => {
    /** Both halves of a Bs900 table whose halves cost Bs500 each. */
    async function seedFullTable() {
      const seeded = await seedFestival({
        tables: [{ individual: 500, fullTablePrice: 900 }],
      });
      const [kept, companion] = seeded.tables[0];
      const { reservation, invoice } = await seedReservation({
        festivalId: seeded.festival.id,
        standIds: [kept.id, companion.id],
        ownerUserId: seeded.owner.id,
        price: 900,
        individualPrice: 500,
        fullTablePrice: 900,
      });
      return { ...seeded, kept, companion, reservation, invoice };
    }

    async function blockerFor(reservationId: number) {
      return (await fetchFullTableDowngradeBlocker(reservationId))
        ?.moneyBlocker;
    }

    async function downgrade(reservationId: number) {
      return downgradeFullTableReservation({
        reservationId,
        idempotencyKey: randomUUID(),
      });
    }

    it("downgrades a table whose only comprobante was rejected", async () => {
      const { owner, kept, companion, reservation, invoice } =
        await seedFullTable();
      await addPayment({
        invoiceId: invoice.id,
        amount: 900,
        userId: owner.id,
        submission: "rejected",
      });

      expect(await blockerFor(reservation.id)).toBeNull();
      expect(await downgrade(reservation.id)).toMatchObject({ success: true });
      expect(await liveMemberStandIds(reservation.id)).toEqual([kept.id]);
      const [companionRow] = await integrationDb!
        .select({ status: stands.status })
        .from(stands)
        .where(eq(stands.id, companion.id));
      expect(companionRow.status).toBe("available");
      expect(Number((await readInvoice(invoice.id)).amount)).toBe(500);
    });

    it("downgrades a table whose credits were already handed back", async () => {
      const { owner, kept, reservation, invoice } = await seedFullTable();
      await allocateCredits({
        invoiceId: invoice.id,
        userId: owner.id,
        amount: 300,
      });
      expect(await blockerFor(reservation.id)).toBe("credits");
      expect(await downgrade(reservation.id)).toMatchObject({
        success: false,
        code: "FULL_TABLE_NOT_DOWNGRADABLE",
      });

      const released = await paymentService.releaseInvoiceCredits({
        invoiceId: invoice.id,
        reason: "Créditos revertidos",
        idempotencyKey: randomUUID(),
      });
      expect(released).toMatchObject({ success: true });

      expect(await blockerFor(reservation.id)).toBeNull();
      expect(await downgrade(reservation.id)).toMatchObject({ success: true });
      expect(await liveMemberStandIds(reservation.id)).toEqual([kept.id]);
      expect(Number((await readInvoice(invoice.id)).amount)).toBe(500);
    });

    it.each([
      {
        name: "an approved payment",
        submission: "approved" as const,
        blocker: "approved_payment",
        reason: "No se puede reducir: el cobro tiene un pago aprobado.",
      },
      {
        name: "a comprobante in review",
        submission: "submitted" as const,
        blocker: "proof_under_review",
        reason:
          "No se puede reducir mientras haya un comprobante o una solicitud en revisión.",
      },
      {
        name: "a legacy payment row with no submission",
        submission: null,
        blocker: "legacy_payment",
        reason: "No se puede reducir: el cobro tiene un pago registrado.",
      },
    ])(
      "refuses with $name, and the edit page disables it with that reason",
      async ({ submission, blocker, reason }) => {
        const { owner, kept, companion, reservation, invoice } =
          await seedFullTable();
        await addPayment({
          invoiceId: invoice.id,
          amount: 300,
          userId: owner.id,
          submission,
        });

        const moneyBlocker = await blockerFor(reservation.id);
        expect(moneyBlocker).toBe(blocker);
        expect(
          fullTableDowngradeDisabledReason({
            isGlobalAdmin: true,
            moneyBlocker: moneyBlocker ?? null,
          }),
        ).toBe(reason);

        expect(await downgrade(reservation.id)).toMatchObject({
          success: false,
          code: "FULL_TABLE_NOT_DOWNGRADABLE",
        });
        // A refusal returns rather than throws; nothing may have moved.
        expect(await liveMemberStandIds(reservation.id)).toEqual([
          kept.id,
          companion.id,
        ]);
        expect(Number((await readInvoice(invoice.id)).amount)).toBe(900);
        expect(
          (await readReservation(reservation.id)).fullTablePriceSnapshot,
        ).toBe(900);
      },
    );

    it("reprices the live cobro and leaves a cancelled one as history", async () => {
      const { owner, reservation, invoice } = await seedFullTable();
      const [cancelled] = await integrationDb!
        .insert(invoices)
        .values({
          date: new Date(),
          userId: owner.id,
          reservationId: reservation.id,
          originalAmount: 900,
          discountAmount: 0,
          amount: 900,
          status: "cancelled",
        })
        .returning();

      expect(await downgrade(reservation.id)).toMatchObject({ success: true });
      expect(Number((await readInvoice(invoice.id)).amount)).toBe(500);
      expect(Number((await readInvoice(cancelled.id)).amount)).toBe(900);
    });

    it("never blocks a full table from before table pricing", async () => {
      const seeded = await seedFestival({
        tables: [{ individual: 500, fullTablePrice: 900 }],
      });
      const [kept, companion] = seeded.tables[0];
      const { reservation, invoice } = await seedReservation({
        festivalId: seeded.festival.id,
        standIds: [kept.id, companion.id],
        ownerUserId: seeded.owner.id,
        price: 500,
        fullTablePrice: null,
      });
      await addPayment({
        invoiceId: invoice.id,
        amount: 500,
        userId: seeded.owner.id,
        submission: "approved",
      });

      // Its cobro already was one half's price, so the downgrade leaves the
      // money alone and has nothing to refuse for.
      expect(await blockerFor(reservation.id)).toBeNull();
      expect(await downgrade(reservation.id)).toMatchObject({ success: true });
      expect(Number((await readInvoice(invoice.id)).amount)).toBe(500);
    });
  });
});
