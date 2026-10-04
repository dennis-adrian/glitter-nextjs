// @vitest-environment node

import { randomUUID } from "crypto";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
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
  creditHolds,
  creditLedgerEntries,
  festivalSectors,
  festivals,
  invoiceCreditAllocations,
  invoices,
  payments,
  reservationFeatureActions,
  reservationParticipants,
  invoiceSettlementSubmissions,
  reservationRequestRegistry,
  scheduledTasks,
  standGroups,
  standHoldMembers,
  standHolds,
  standReservationEvents,
  standReservationStands,
  standReservations,
  stands,
  userRequests,
  users,
} from "@/db/schema";
import type { FullTableUpgradeExpectation } from "@/app/lib/reservations/full-table-upgrade";

const currentProfileMock = vi.hoisted(() => vi.fn());
const cleanupMock = vi.hoisted(() => vi.fn());

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
  enqueueStorageCleanupJob: cleanupMock,
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

let upgradeFullTableReservation: (typeof import("@/app/lib/reservations/full-table-upgrade-service"))["upgradeFullTableReservation"];
let fetchFullTableUpgradePreview: (typeof import("@/app/lib/reservations/full-table-upgrade-queries"))["fetchFullTableUpgradePreview"];
let downgradeFullTableReservation: (typeof import("@/app/lib/reservations/full-table-service"))["downgradeFullTableReservation"];
let changeReservationStand: (typeof import("@/app/lib/reservations/stand-change-service"))["changeReservationStand"];
let updateReservationPartner: (typeof import("@/app/lib/reservations/admin-service"))["updateReservationPartner"];
let paymentService: typeof import("@/app/lib/reservations/payment-service");
let creditService: typeof import("@/app/lib/credits/service");

const ADMIN = { id: 0, role: "admin", status: "verified", category: "none" };

/** For refusals that happen before the expectation is ever compared. */
const ANY_EXPECTATION: FullTableUpgradeExpectation = {
  tablePrice: 0,
  settlementKind: "none",
  settlementAmount: 0,
};

describeDatabase("admin full-table upgrade", () => {
  beforeAll(async () => {
    // `=` rather than `??=`: a POSTGRES_URL inherited from .env.local must
    // never be the database the app code under test writes to.
    process.env.POSTGRES_URL = testDatabaseUrl!;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";
    ({ upgradeFullTableReservation } =
      await import("@/app/lib/reservations/full-table-upgrade-service"));
    ({ fetchFullTableUpgradePreview } =
      await import("@/app/lib/reservations/full-table-upgrade-queries"));
    ({ downgradeFullTableReservation } =
      await import("@/app/lib/reservations/full-table-service"));
    ({ changeReservationStand } =
      await import("@/app/lib/reservations/stand-change-service"));
    ({ updateReservationPartner } =
      await import("@/app/lib/reservations/admin-service"));
    paymentService = await import("@/app/lib/reservations/payment-service");
    creditService = await import("@/app/lib/credits/service");
  }, 60_000);

  afterEach(async () => {
    currentProfileMock.mockReset();
    cleanupMock.mockReset();
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
        await db
          .delete(standReservations)
          .where(inArray(standReservations.id, reservationIds));
      }
      // Cascades to credit_holds; its owner FK is `restrict`.
      await db
        .delete(reservationFeatureActions)
        .where(eq(reservationFeatureActions.festivalId, fixture.festivalId));
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
      // The ledger is append-only in production, enforced by a trigger, and its
      // user FK is `restrict` — so neither the entries nor their users can go
      // while it is on. Dropped only for this delete and restored immediately,
      // so no test runs against a database that is missing it.
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

  type TableInput = {
    /** Null leaves the table unpriced. */
    fullTablePrice: number | null;
    standsInGroup?: number;
    individual?: number;
    shared?: number | null;
  };

  /**
   * One sector with declared full tables — halves at 300 individual / 500
   * shared unless told otherwise — plus any ungrouped stands.
   */
  async function seedFestival(input: {
    userCount: number;
    tables?: TableInput[];
    looseStands?: { individual: number; shared?: number | null }[];
  }) {
    const db = integrationDb!;
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const [festival] = await db
      .insert(festivals)
      .values({
        name: `FullTableUpgrade ${suffix}`,
        status: "active",
        festivalType: "glitter",
        reservationsStartDate: new Date(Date.now() - 60_000),
      })
      .returning();

    const [admin] = await db
      .insert(users)
      .values({
        clerkId: `ftu-admin-${suffix}`,
        email: `ftu-admin-${suffix}@example.test`,
        displayName: `FTU Admin ${suffix}`,
        status: "verified",
        role: "admin",
      })
      .returning();

    const participants =
      input.userCount === 0
        ? []
        : await db
            .insert(users)
            .values(
              Array.from({ length: input.userCount }, (_, index) => ({
                clerkId: `ftu-${suffix}-${index}`,
                email: `ftu-${suffix}-${index}@example.test`,
                displayName: `FTU ${suffix}-${index}`,
                status: "verified" as const,
                category: "illustration" as const,
              })),
            )
            .returning();

    if (participants.length > 0) {
      await db.insert(userRequests).values(
        participants.map((user) => ({
          userId: user.id,
          festivalId: festival.id,
          type: "festival_participation" as const,
          status: "accepted" as const,
        })),
      );
    }

    const [sector] = await db
      .insert(festivalSectors)
      .values({
        name: `S ${suffix}`,
        festivalId: festival.id,
        orderInFestival: 1,
      })
      .returning();

    let standNumber = 1;
    const tables: {
      group: typeof standGroups.$inferSelect;
      stands: (typeof stands.$inferSelect)[];
    }[] = [];
    for (const table of input.tables ?? []) {
      const [group] = await db
        .insert(standGroups)
        .values({
          festivalSectorId: sector.id,
          type: "full_table",
          fullTablePrice: table.fullTablePrice,
        })
        .returning();
      const individual = table.individual ?? 300;
      const shared = table.shared === undefined ? 500 : table.shared;
      const rows = [];
      for (let index = 0; index < (table.standsInGroup ?? 2); index += 1) {
        rows.push({
          festivalId: festival.id,
          festivalSectorId: sector.id,
          standGroupId: group.id,
          standNumber: standNumber++,
          standCategory: "illustration" as const,
          status: "available" as const,
          price: individual,
          individualPrice: individual,
          sharedPrice: shared,
        });
      }
      tables.push({
        group,
        stands: await db.insert(stands).values(rows).returning(),
      });
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

    return { festival, admin, participants, sector, tables, looseStands };
  }

  /** A live single-stand reservation, built directly. */
  async function seedReservation(input: {
    festivalId: number;
    standId: number;
    ownerUserId: number | null;
    status?: "pending" | "verification_payment" | "accepted" | "rejected";
    price: number;
    /** Defaults to `price`; null reproduces a legacy row. */
    individualPrice?: number | null;
    sharedPrice?: number | null;
    standStatus?: "reserved" | "confirmed";
    discountAmount?: number;
    /** Overrides `amount`, e.g. after an admin wrote part of it off. */
    invoiceAmount?: number;
    invoiceStatus?: "pending" | "verification_payment" | "paid";
    /** Who the invoice is for; null means the reservation has no invoice. */
    invoiceUserId?: number | null;
    participantUserIds?: number[];
  }) {
    const db = integrationDb!;
    const status = input.status ?? "pending";
    const participantUserIds =
      input.participantUserIds ??
      (input.ownerUserId != null ? [input.ownerUserId] : []);
    const [reservation] = await db
      .insert(standReservations)
      .values({
        festivalId: input.festivalId,
        standId: input.standId,
        status,
        source: "admin_assignment",
        ownerUserId: input.ownerUserId,
        priceAmountSnapshot: input.price,
        individualPriceSnapshot:
          input.individualPrice === undefined
            ? input.price
            : input.individualPrice,
        sharedPriceSnapshot: input.sharedPrice ?? null,
        bookedParticipantCount: Math.max(1, participantUserIds.length),
      })
      .returning();

    await db.insert(standReservationStands).values({
      reservationId: reservation.id,
      standId: input.standId,
      position: 0,
    });

    if (participantUserIds.length > 0) {
      await db.insert(reservationParticipants).values(
        participantUserIds.map((userId) => ({
          userId,
          reservationId: reservation.id,
        })),
      );
    }

    const invoiceUserId =
      input.invoiceUserId === undefined
        ? input.ownerUserId
        : input.invoiceUserId;
    let invoice: typeof invoices.$inferSelect | null = null;
    if (invoiceUserId != null) {
      const discountAmount = input.discountAmount ?? 0;
      [invoice] = await db
        .insert(invoices)
        .values({
          date: new Date(),
          userId: invoiceUserId,
          reservationId: reservation.id,
          originalAmount: input.price,
          discountAmount,
          amount: input.invoiceAmount ?? input.price - discountAmount,
          status: input.invoiceStatus ?? "pending",
        })
        .returning();
    }

    await db
      .update(stands)
      .set({ status: input.standStatus ?? "reserved" })
      .where(eq(stands.id, input.standId));

    return { reservation, invoice: invoice! };
  }

  async function readReservation(id: number) {
    const [row] = await integrationDb!
      .select()
      .from(standReservations)
      .where(eq(standReservations.id, id));
    return row;
  }

  /** Every member row, released ones included, lowest position first. */
  async function readMembers(reservationId: number) {
    return integrationDb!
      .select()
      .from(standReservationStands)
      .where(eq(standReservationStands.reservationId, reservationId))
      .orderBy(asc(standReservationStands.position));
  }

  async function readLiveMembers(reservationId: number) {
    return integrationDb!
      .select()
      .from(standReservationStands)
      .where(
        and(
          eq(standReservationStands.reservationId, reservationId),
          isNull(standReservationStands.releasedAt),
        ),
      )
      .orderBy(asc(standReservationStands.position));
  }

  async function readInvoice(id: number) {
    const [row] = await integrationDb!
      .select()
      .from(invoices)
      .where(eq(invoices.id, id));
    return row;
  }

  async function readStand(id: number) {
    const [row] = await integrationDb!
      .select()
      .from(stands)
      .where(eq(stands.id, id));
    return row;
  }

  async function readLedger(userId: number) {
    return integrationDb!
      .select()
      .from(creditLedgerEntries)
      .where(eq(creditLedgerEntries.userId, userId));
  }

  async function readTasks(reservationId: number) {
    return integrationDb!
      .select()
      .from(scheduledTasks)
      .where(eq(scheduledTasks.reservationId, reservationId));
  }

  async function readUpgradeEvents(reservationId: number) {
    const rows = await integrationDb!
      .select()
      .from(standReservationEvents)
      .where(eq(standReservationEvents.reservationId, reservationId));
    return rows.filter(
      (row) =>
        (row.payload as { action?: string } | null)?.action ===
        "full_table_manually_upgraded",
    );
  }

  /**
   * Money that actually counts as covered: a payment plus the approved
   * settlement submission that vouches for it, which is what
   * `getInvoiceTenderTotalsInTx` sums.
   */
  async function payInvoice(input: {
    invoiceId: number;
    amount: number;
    userId: number;
    submissionStatus?: "approved" | "submitted";
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
    const submissionStatus = input.submissionStatus ?? "approved";
    const [submission] = await db
      .insert(invoiceSettlementSubmissions)
      .values({
        invoiceId: input.invoiceId,
        paymentId: payment.id,
        kind: "payment_proof",
        status: submissionStatus,
        uploadedByUserId: input.userId,
        ...(submissionStatus === "approved"
          ? { reviewedByUserId: input.userId, reviewedAt: new Date() }
          : {}),
      })
      .returning();
    if (submissionStatus === "approved") {
      await db
        .update(invoices)
        .set({ status: "paid" })
        .where(eq(invoices.id, input.invoiceId));
    }
    return { payment, submission };
  }

  /** Credits spent on the invoice the way applyInvoiceCredits spends them. */
  async function allocateCredits(input: {
    invoiceId: number;
    userId: number;
    amount: number;
    reversed?: boolean;
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
    if (input.reversed) {
      const refunded = await creditService.refundInvoiceCreditsInTx(
        db as never,
        {
          userId: input.userId,
          amount: input.amount,
          spendLedgerEntryId: debit.data.ledgerEntryId,
          idempotencyKey: randomUUID(),
        },
      );
      if (!refunded.ok) {
        throw new Error(`fixture refund failed: ${refunded.code}`);
      }
    }
  }

  /**
   * Upgrades with exactly what the dialog would send: the preview's own
   * expectation. Every upgrade here is therefore also a parity check — the
   * service refuses as stale if its locked plan differs from the preview's.
   */
  async function upgradeAsPreviewed(
    reservationId: number,
    idempotencyKey = randomUUID(),
  ) {
    const preview = await fetchFullTableUpgradePreview(reservationId);
    if (!preview?.expected || !preview.plan) {
      throw new Error("expected an upgradable preview");
    }
    const result = await upgradeFullTableReservation({
      reservationId,
      idempotencyKey,
      expected: preview.expected,
    });
    if (result.success) {
      expect(result.data.settlement).toEqual({
        kind: preview.expected.settlementKind,
        amount: preview.expected.settlementAmount,
      });
    }
    return { preview, result };
  }

  /** Everything a refusal must leave exactly as it found it. */
  async function snapshot(reservationId: number, standIds: number[]) {
    const db = integrationDb!;
    const reservation = await readReservation(reservationId);
    return {
      reservation,
      members: await readMembers(reservationId),
      invoices: await db
        .select()
        .from(invoices)
        .where(eq(invoices.reservationId, reservationId)),
      stands: await db
        .select({ id: stands.id, status: stands.status })
        .from(stands)
        .where(inArray(stands.id, standIds))
        .orderBy(asc(stands.id)),
      tasks: await readTasks(reservationId),
      events: await readUpgradeEvents(reservationId),
      ledger:
        reservation.ownerUserId == null
          ? []
          : await readLedger(reservation.ownerUserId),
    };
  }

  describe("settlement", () => {
    it("adds the companion to an unpaid half and reprices it to the table", async () => {
      const seeded = await seedFestival({
        userCount: 1,
        tables: [{ fullTablePrice: 450 }],
      });
      const [kept, companion] = seeded.tables[0].stands;
      const owner = seeded.participants[0];
      const { reservation, invoice } = await seedReservation({
        festivalId: seeded.festival.id,
        standId: kept.id,
        ownerUserId: owner.id,
        price: 300,
        sharedPrice: 500,
      });

      const { preview, result } = await upgradeAsPreviewed(reservation.id);
      expect(preview).toMatchObject({
        keptStand: { id: kept.id },
        inFullTableGroup: true,
        groupIssue: null,
        companion: { id: companion.id },
        companionState: "free",
        tablePrice: 450,
        proofUnderReview: false,
        hasInvoice: true,
        hasOwner: true,
        hasTender: false,
      });

      expect(result).toEqual({
        success: true,
        data: {
          keptStandId: kept.id,
          addedStandId: companion.id,
          settlement: { kind: "none", amount: 0 },
          accepted: false,
        },
        message: "La reserva ahora ocupa la mesa completa.",
      });

      const upgraded = await readReservation(reservation.id);
      expect(upgraded.status).toBe("pending");
      expect(upgraded.standId).toBe(kept.id);
      expect(Number(upgraded.priceAmountSnapshot)).toBe(450);
      expect(Number(upgraded.fullTablePriceSnapshot)).toBe(450);
      // The half's own prices stay on record for a later downgrade.
      expect(Number(upgraded.individualPriceSnapshot)).toBe(300);
      expect(Number(upgraded.sharedPriceSnapshot)).toBe(500);
      expect(upgraded.bookedParticipantCount).toBe(1);

      const members = await readLiveMembers(reservation.id);
      expect(
        members.map((member) => [member.standId, member.position]),
      ).toEqual([
        [kept.id, 0],
        [companion.id, 1],
      ]);
      expect(members.every((m) => m.reservationStatus === "pending")).toBe(
        true,
      );

      const repriced = await readInvoice(invoice.id);
      expect(Number(repriced.originalAmount)).toBe(450);
      expect(Number(repriced.amount)).toBe(450);
      expect(repriced.status).toBe("pending");

      expect((await readStand(kept.id)).status).toBe("reserved");
      expect((await readStand(companion.id)).status).toBe("reserved");

      const events = await readUpgradeEvents(reservation.id);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        eventType: "status_changed",
        fromStatus: "pending",
        toStatus: "pending",
        payload: {
          action: "full_table_manually_upgraded",
          keptStandId: kept.id,
          addedStandId: companion.id,
          fromPrice: 300,
          toPrice: 450,
          settlement: "none",
          settlementAmount: 0,
        },
      });

      expect(await readLedger(owner.id)).toHaveLength(0);
      expect(await readTasks(reservation.id)).toHaveLength(0);
    });

    it("reopens a paid half for the difference, then paying it confirms both halves", async () => {
      const seeded = await seedFestival({
        userCount: 1,
        tables: [{ fullTablePrice: 450 }],
      });
      const [kept, companion] = seeded.tables[0].stands;
      const owner = seeded.participants[0];
      const { reservation, invoice } = await seedReservation({
        festivalId: seeded.festival.id,
        standId: kept.id,
        ownerUserId: owner.id,
        status: "accepted",
        price: 300,
        standStatus: "confirmed",
      });
      await payInvoice({
        invoiceId: invoice.id,
        amount: 300,
        userId: owner.id,
      });
      const before = new Date();

      const { preview, result } = await upgradeAsPreviewed(reservation.id);
      expect(preview.hasTender).toBe(true);
      expect(preview.plan).toMatchObject({
        coveredAmount: 300,
        newInvoiceAmount: 450,
        settlement: { kind: "balance_due", outstandingAmount: 150 },
      });
      expect(result).toMatchObject({
        success: true,
        message:
          "La reserva ahora ocupa la mesa completa. Quedó un saldo pendiente de Bs150.",
      });

      const upgraded = await readReservation(reservation.id);
      expect(upgraded.status).toBe("pending");
      expect((await readStand(kept.id)).status).toBe("reserved");
      expect((await readStand(companion.id)).status).toBe("reserved");

      const repriced = await readInvoice(invoice.id);
      expect(Number(repriced.amount)).toBe(450);
      expect(repriced.status).toBe("pending");
      expect(repriced.dueAt!.getTime()).toBeGreaterThan(before.getTime());

      const open = (await readTasks(reservation.id)).filter(
        (task) => task.completedAt === null,
      );
      expect(open).toHaveLength(1);
      expect(open[0].profileId).toBe(owner.id);
      expect(open[0].dueDate.getTime()).toBeGreaterThan(before.getTime());
      expect(open[0].dueDate.getTime()).toBeGreaterThan(
        open[0].reminderTime.getTime(),
      );
      expect(await readLedger(owner.id)).toHaveLength(0);

      const [event] = await readUpgradeEvents(reservation.id);
      expect(event).toMatchObject({
        fromStatus: "accepted",
        toStatus: "pending",
        payload: { settlement: "balance_due", settlementAmount: 150 },
      });

      // Once money sits on the table, the downgrade refuses it for good.
      expect(
        await downgradeFullTableReservation({
          reservationId: reservation.id,
          idempotencyKey: randomUUID(),
        }),
      ).toMatchObject({ success: false, code: "FULL_TABLE_NOT_DOWNGRADABLE" });

      // Paying the difference confirms the whole table, not just one half.
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
      if (!upload.success) throw new Error(upload.message);
      expect(
        await paymentService.approveInvoiceSettlement({
          submissionId: upload.data.submissionId,
        }),
      ).toMatchObject({ success: true });

      expect((await readReservation(reservation.id)).status).toBe("accepted");
      expect((await readInvoice(invoice.id)).status).toBe("paid");
      expect((await readStand(kept.id)).status).toBe("confirmed");
      expect((await readStand(companion.id)).status).toBe("confirmed");
    });

    it("hands a surplus back as credits once, even when retried", async () => {
      const seeded = await seedFestival({
        userCount: 2,
        tables: [{ fullTablePrice: 450 }],
      });
      const [kept, companion] = seeded.tables[0].stands;
      const [owner, partner] = seeded.participants;
      const { reservation, invoice } = await seedReservation({
        festivalId: seeded.festival.id,
        standId: kept.id,
        ownerUserId: owner.id,
        participantUserIds: [owner.id, partner.id],
        status: "accepted",
        price: 500,
        individualPrice: 300,
        sharedPrice: 500,
        standStatus: "confirmed",
      });
      await payInvoice({
        invoiceId: invoice.id,
        amount: 500,
        userId: owner.id,
      });
      const key = randomUUID();

      const { result } = await upgradeAsPreviewed(reservation.id, key);
      expect(result).toMatchObject({
        success: true,
        message:
          "La reserva ahora ocupa la mesa completa. Se devolvieron Bs50 en créditos.",
      });

      const upgraded = await readReservation(reservation.id);
      expect(upgraded.status).toBe("accepted");
      expect(upgraded.bookedParticipantCount).toBe(2);
      expect((await readStand(kept.id)).status).toBe("confirmed");
      expect((await readStand(companion.id)).status).toBe("confirmed");
      const repriced = await readInvoice(invoice.id);
      expect(Number(repriced.amount)).toBe(450);
      expect(repriced.status).toBe("paid");

      const ledger = await readLedger(owner.id);
      expect(ledger).toHaveLength(1);
      expect(ledger[0].type).toBe("admin_grant");
      expect(Number(ledger[0].amount)).toBe(50);
      expect(ledger[0].metadata).toMatchObject({
        standChangeRefundReservationId: String(reservation.id),
      });
      expect((ledger[0].metadata as { reason: string }).reason).toContain(
        "Mesa completa",
      );
      expect(
        (await readTasks(reservation.id)).filter((t) => t.completedAt === null),
      ).toHaveLength(0);

      // A lost response retried with the same key replays, and still says
      // what happened to the money.
      const replay = await upgradeFullTableReservation({
        reservationId: reservation.id,
        idempotencyKey: key,
        expected: ANY_EXPECTATION,
      });
      expect(replay).toEqual({
        success: true,
        data: {
          keptStandId: kept.id,
          addedStandId: companion.id,
          settlement: { kind: "overpaid", amount: 50 },
          accepted: false,
        },
        message:
          "La reserva ahora ocupa la mesa completa. Se devolvieron Bs50 en créditos.",
      });
      expect(await readLedger(owner.id)).toHaveLength(1);
      expect(await readUpgradeEvents(reservation.id)).toHaveLength(1);
      expect(await readMembers(reservation.id)).toHaveLength(2);
    });

    it("counts confirmed credits as covered and ignores a reversed allocation", async () => {
      const seeded = await seedFestival({
        userCount: 1,
        tables: [{ fullTablePrice: 450 }],
      });
      const [kept] = seeded.tables[0].stands;
      const owner = seeded.participants[0];
      const { reservation, invoice } = await seedReservation({
        festivalId: seeded.festival.id,
        standId: kept.id,
        ownerUserId: owner.id,
        status: "accepted",
        price: 300,
        standStatus: "confirmed",
        invoiceStatus: "paid",
      });
      await allocateCredits({
        invoiceId: invoice.id,
        userId: owner.id,
        amount: 300,
      });
      await allocateCredits({
        invoiceId: invoice.id,
        userId: owner.id,
        amount: 100,
        reversed: true,
      });
      const ledgerBefore = await readLedger(owner.id);

      const { preview, result } = await upgradeAsPreviewed(reservation.id);
      expect(preview.plan?.coveredAmount).toBe(300);
      expect(result).toMatchObject({
        success: true,
        data: { settlement: { kind: "balance_due", amount: 150 } },
      });
      expect((await readReservation(reservation.id)).status).toBe("pending");
      // Nothing was handed back and nothing further was spent.
      expect(await readLedger(owner.id)).toHaveLength(ledgerBefore.length);
    });

    it("moves a partial payer's open task instead of opening a second one", async () => {
      const seeded = await seedFestival({
        userCount: 1,
        tables: [{ fullTablePrice: 450 }],
      });
      const [kept] = seeded.tables[0].stands;
      const owner = seeded.participants[0];
      const { reservation, invoice } = await seedReservation({
        festivalId: seeded.festival.id,
        standId: kept.id,
        ownerUserId: owner.id,
        price: 300,
      });
      await payInvoice({
        invoiceId: invoice.id,
        amount: 100,
        userId: owner.id,
      });
      await integrationDb!
        .update(invoices)
        .set({ status: "pending" })
        .where(eq(invoices.id, invoice.id));
      // The booking's clock, still running, whose reminder already went out.
      const oldDue = new Date(Date.now() + 60_000);
      await integrationDb!.insert(scheduledTasks).values({
        dueDate: oldDue,
        reminderTime: new Date(Date.now() + 30_000),
        reminderSentAt: new Date(),
        profileId: owner.id,
        reservationId: reservation.id,
        taskType: "stand_reservation",
      });

      const { result } = await upgradeAsPreviewed(reservation.id);
      expect(result).toMatchObject({
        success: true,
        data: { settlement: { kind: "balance_due", amount: 350 } },
      });

      const open = (await readTasks(reservation.id)).filter(
        (task) => task.completedAt === null,
      );
      expect(open).toHaveLength(1);
      expect(open[0].dueDate.getTime()).toBeGreaterThan(oldDue.getTime());
      // The new balance gets its own reminder.
      expect(open[0].reminderSentAt).toBeNull();
      const [event] = await readUpgradeEvents(reservation.id);
      expect(event).toMatchObject({
        fromStatus: "pending",
        toStatus: "pending",
      });
    });

    it("keeps the discount on the reprice and clamps it to the table price", async () => {
      const seeded = await seedFestival({
        userCount: 3,
        tables: [{ fullTablePrice: 450 }, { fullTablePrice: 450 }],
      });
      const [owner, partner, other] = seeded.participants;

      const discounted = await seedReservation({
        festivalId: seeded.festival.id,
        standId: seeded.tables[0].stands[0].id,
        ownerUserId: owner.id,
        price: 300,
        discountAmount: 50,
      });
      const { preview } = await upgradeAsPreviewed(discounted.reservation.id);
      expect(preview.plan).toMatchObject({
        currentInvoiceAmount: 250,
        discountAmount: 50,
        newInvoiceAmount: 400,
      });
      const kept = await readInvoice(discounted.invoice.id);
      expect(Number(kept.originalAmount)).toBe(450);
      expect(Number(kept.discountAmount)).toBe(50);
      expect(Number(kept.amount)).toBe(400);

      // A discount agreed against a dearer booking is bounded by the table.
      const oversized = await seedReservation({
        festivalId: seeded.festival.id,
        standId: seeded.tables[1].stands[0].id,
        ownerUserId: partner.id,
        participantUserIds: [partner.id, other.id],
        price: 500,
        individualPrice: 300,
        sharedPrice: 500,
        discountAmount: 500,
      });
      await upgradeAsPreviewed(oversized.reservation.id);
      const clamped = await readInvoice(oversized.invoice.id);
      expect(Number(clamped.originalAmount)).toBe(450);
      expect(Number(clamped.discountAmount)).toBe(450);
      expect(Number(clamped.amount)).toBe(0);
    });

    it("nets an earlier stand-change refund out of what counts as covered", async () => {
      const seeded = await seedFestival({
        userCount: 1,
        tables: [{ fullTablePrice: 450 }],
        looseStands: [{ individual: 500 }],
      });
      const [kept] = seeded.tables[0].stands;
      const [expensive] = seeded.looseStands;
      const owner = seeded.participants[0];
      const { reservation, invoice } = await seedReservation({
        festivalId: seeded.festival.id,
        standId: expensive.id,
        ownerUserId: owner.id,
        status: "accepted",
        price: 500,
        standStatus: "confirmed",
      });
      await payInvoice({
        invoiceId: invoice.id,
        amount: 500,
        userId: owner.id,
      });
      // 500 paid; the cheaper half already handed 200 back.
      expect(
        await changeReservationStand({
          reservationId: reservation.id,
          destinationStandId: kept.id,
          idempotencyKey: randomUUID(),
        }),
      ).toMatchObject({ success: true });
      expect(await readLedger(owner.id)).toHaveLength(1);

      // Only 300 is still covered, so the 450 table owes 150 — not a
      // further 50 refund measured against money already in the wallet.
      const { preview, result } = await upgradeAsPreviewed(reservation.id);
      expect(preview.plan?.coveredAmount).toBe(300);
      expect(result).toMatchObject({
        success: true,
        data: { settlement: { kind: "balance_due", amount: 150 } },
      });
      expect(await readLedger(owner.id)).toHaveLength(1);
      expect((await readReservation(reservation.id)).status).toBe("pending");
    });

    it("reopens an accepted zero-value reservation for the difference", async () => {
      const seeded = await seedFestival({
        userCount: 1,
        tables: [{ fullTablePrice: 450 }],
      });
      const [kept, companion] = seeded.tables[0].stands;
      const owner = seeded.participants[0];
      const { reservation, invoice } = await seedReservation({
        festivalId: seeded.festival.id,
        standId: kept.id,
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

      const { result } = await upgradeAsPreviewed(reservation.id);
      // Confirmed at no cost, it owes the 150 the discount does not reach
      // like a paid reservation would (Dennis, 2026-09-29). #551 pinned the
      // opposite: still accepted, the cobro marked paid at 150.
      expect(result).toMatchObject({
        success: true,
        data: { settlement: { kind: "balance_due", amount: 150 } },
      });
      expect((await readReservation(reservation.id)).status).toBe("pending");
      const repriced = await readInvoice(invoice.id);
      expect(Number(repriced.discountAmount)).toBe(300);
      expect(Number(repriced.amount)).toBe(150);
      expect(repriced.status).toBe("pending");
      expect((await readStand(kept.id)).status).toBe("reserved");
      expect((await readStand(companion.id)).status).toBe("reserved");
      const open = (await readTasks(reservation.id)).filter(
        (task) => task.completedAt === null,
      );
      expect(open).toHaveLength(1);
      expect(open[0].profileId).toBe(owner.id);
    });

    /**
     * A positive cobro marked paid with no payment rows was paid outside the
     * system. Only a reservation confirmed at no cost owes the difference
     * (Dennis, 2026-09-29), so this one keeps the pre-batch behaviour: the
     * cobro moves to the table price and nothing reopens.
     */
    it("only reprices an accepted half marked paid with no payment rows", async () => {
      const seeded = await seedFestival({
        userCount: 1,
        tables: [{ fullTablePrice: 450 }],
      });
      const [kept, companion] = seeded.tables[0].stands;
      const owner = seeded.participants[0];
      const { reservation, invoice } = await seedReservation({
        festivalId: seeded.festival.id,
        standId: kept.id,
        ownerUserId: owner.id,
        status: "accepted",
        price: 300,
        standStatus: "confirmed",
        invoiceStatus: "paid",
      });

      const { preview, result } = await upgradeAsPreviewed(reservation.id);
      expect(preview.plan?.confirmedAtNoCost).toBe(false);
      expect(result).toMatchObject({
        success: true,
        data: { settlement: { kind: "none", amount: 0 }, accepted: false },
      });
      expect((await readReservation(reservation.id)).status).toBe("accepted");
      const repriced = await readInvoice(invoice.id);
      expect(Number(repriced.amount)).toBe(450);
      expect(repriced.status).toBe("paid");
      expect((await readStand(kept.id)).status).toBe("confirmed");
      expect((await readStand(companion.id)).status).toBe("confirmed");
      expect(
        (await readTasks(reservation.id)).filter(
          (task) => task.completedAt === null,
        ),
      ).toHaveLength(0);
    });

    it("keeps a written-off amount off the table's cobro", async () => {
      const seeded = await seedFestival({
        userCount: 1,
        tables: [{ fullTablePrice: 450 }],
      });
      const [kept] = seeded.tables[0].stands;
      const owner = seeded.participants[0];
      const { reservation, invoice } = await seedReservation({
        festivalId: seeded.festival.id,
        standId: kept.id,
        ownerUserId: owner.id,
        status: "accepted",
        price: 300,
        invoiceAmount: 200,
        standStatus: "confirmed",
      });
      await payInvoice({
        invoiceId: invoice.id,
        amount: 200,
        userId: owner.id,
      });

      const { preview, result } = await upgradeAsPreviewed(reservation.id);
      expect(preview.plan).toMatchObject({
        currentInvoiceAmount: 200,
        writtenOffAmount: 100,
        newInvoiceAmount: 350,
      });
      // The Bs100 waived is a fixed concession (Dennis, 2026-09-29): the table
      // asks 450 - 100 against the 200 paid. #551 priced it from scratch and
      // asked for 250.
      expect(result).toMatchObject({
        success: true,
        data: { settlement: { kind: "balance_due", amount: 150 } },
      });
      expect((await readReservation(reservation.id)).status).toBe("pending");
      const repriced = await readInvoice(invoice.id);
      expect(Number(repriced.originalAmount)).toBe(450);
      expect(Number(repriced.amount)).toBe(350);
    });

    it("upgrades an external participant's reservation, which has no cobro", async () => {
      const seeded = await seedFestival({
        userCount: 0,
        tables: [{ fullTablePrice: 450 }],
      });
      const [kept, companion] = seeded.tables[0].stands;
      const { reservation } = await seedReservation({
        festivalId: seeded.festival.id,
        standId: kept.id,
        ownerUserId: null,
        status: "accepted",
        price: 300,
        standStatus: "confirmed",
      });

      const { preview, result } = await upgradeAsPreviewed(reservation.id);
      expect(preview).toMatchObject({ hasInvoice: false, hasOwner: false });
      expect(result).toMatchObject({
        success: true,
        data: { settlement: { kind: "none", amount: 0 } },
      });
      const upgraded = await readReservation(reservation.id);
      expect(upgraded.status).toBe("accepted");
      expect(Number(upgraded.priceAmountSnapshot)).toBe(450);
      expect((await readStand(kept.id)).status).toBe("confirmed");
      expect((await readStand(companion.id)).status).toBe("confirmed");
    });

    it("refuses a surplus with nobody to hand it back to", async () => {
      const seeded = await seedFestival({
        userCount: 2,
        tables: [{ fullTablePrice: 450 }],
      });
      const [kept, companion] = seeded.tables[0].stands;
      const [payer, partner] = seeded.participants;
      // A legacy row: no owner recorded, the cobro in a participant's name.
      const { reservation, invoice } = await seedReservation({
        festivalId: seeded.festival.id,
        standId: kept.id,
        ownerUserId: null,
        invoiceUserId: payer.id,
        participantUserIds: [payer.id, partner.id],
        status: "accepted",
        price: 500,
        individualPrice: 300,
        sharedPrice: 500,
        standStatus: "confirmed",
      });
      await payInvoice({
        invoiceId: invoice.id,
        amount: 500,
        userId: payer.id,
      });
      const preview = await fetchFullTableUpgradePreview(reservation.id);
      expect(preview).toMatchObject({
        hasOwner: false,
        plan: { settlement: { kind: "overpaid", refundAmount: 50 } },
      });
      const before = await snapshot(reservation.id, [kept.id, companion.id]);

      const result = await upgradeFullTableReservation({
        reservationId: reservation.id,
        idempotencyKey: randomUUID(),
        expected: preview!.expected!,
      });
      expect(result).toMatchObject({
        success: false,
        code: "FULL_TABLE_UPGRADE_REFUND_NO_OWNER",
      });
      expect(await snapshot(reservation.id, [kept.id, companion.id])).toEqual(
        before,
      );
      expect(await readLedger(payer.id)).toHaveLength(0);
    });
  });

  describe("consent and refusals", () => {
    it("refuses a stale confirmation without writing, then accepts the real one", async () => {
      const seeded = await seedFestival({
        userCount: 1,
        tables: [{ fullTablePrice: 450 }],
      });
      const [kept, companion] = seeded.tables[0].stands;
      const owner = seeded.participants[0];
      const { reservation, invoice } = await seedReservation({
        festivalId: seeded.festival.id,
        standId: kept.id,
        ownerUserId: owner.id,
        // Accepted with a positive cobro and no payment rows: paid outside
        // the system, so the first render promises nothing to settle.
        status: "accepted",
        price: 300,
        standStatus: "confirmed",
      });
      // The dialog rendered before the payment was approved: it promised a
      // repricing with nothing to settle.
      const rendered = await fetchFullTableUpgradePreview(reservation.id);
      expect(rendered?.expected).toEqual({
        tablePrice: 450,
        settlementKind: "none",
        settlementAmount: 0,
      });
      await payInvoice({
        invoiceId: invoice.id,
        amount: 300,
        userId: owner.id,
      });
      const before = await snapshot(reservation.id, [kept.id, companion.id]);
      const key = randomUUID();

      const stale = await upgradeFullTableReservation({
        reservationId: reservation.id,
        idempotencyKey: key,
        expected: rendered!.expected!,
      });
      expect(stale).toEqual({
        success: false,
        code: "FULL_TABLE_UPGRADE_STALE",
        message:
          "El monto cambió desde que abriste el diálogo. Actualizá la página y revisalo de nuevo.",
      });
      expect(await snapshot(reservation.id, [kept.id, companion.id])).toEqual(
        before,
      );

      // A price change after render is just as stale.
      expect(
        await upgradeFullTableReservation({
          reservationId: reservation.id,
          idempotencyKey: key,
          expected: {
            tablePrice: 500,
            settlementKind: "balance_due",
            settlementAmount: 150,
          },
        }),
      ).toMatchObject({ success: false, code: "FULL_TABLE_UPGRADE_STALE" });

      // The claim was released, so the same key goes through once the admin
      // has seen the real numbers.
      const { result } = await upgradeAsPreviewed(reservation.id, key);
      expect(result).toMatchObject({
        success: true,
        data: { settlement: { kind: "balance_due", amount: 150 } },
      });
    });

    it("refuses while a comprobante is under review, and goes through once it is resolved", async () => {
      const seeded = await seedFestival({
        userCount: 1,
        tables: [{ fullTablePrice: 450 }],
      });
      const [kept, companion] = seeded.tables[0].stands;
      const owner = seeded.participants[0];
      const { reservation, invoice } = await seedReservation({
        festivalId: seeded.festival.id,
        standId: kept.id,
        ownerUserId: owner.id,
        status: "verification_payment",
        price: 300,
        invoiceStatus: "verification_payment",
      });
      const { submission } = await payInvoice({
        invoiceId: invoice.id,
        amount: 300,
        userId: owner.id,
        submissionStatus: "submitted",
      });
      const preview = await fetchFullTableUpgradePreview(reservation.id);
      expect(preview?.proofUnderReview).toBe(true);
      const before = await snapshot(reservation.id, [kept.id, companion.id]);
      const key = randomUUID();

      const refused = await upgradeFullTableReservation({
        reservationId: reservation.id,
        idempotencyKey: key,
        expected: preview!.expected!,
      });
      expect(refused).toEqual({
        success: false,
        code: "FULL_TABLE_UPGRADE_PROOF_UNDER_REVIEW",
        message:
          "Hay un comprobante o una solicitud en revisión para esta reserva. Resolvelo antes de ampliarla a mesa completa.",
      });
      expect(await snapshot(reservation.id, [kept.id, companion.id])).toEqual(
        before,
      );

      await integrationDb!
        .update(invoiceSettlementSubmissions)
        .set({ status: "rejected", reviewedAt: new Date() })
        .where(eq(invoiceSettlementSubmissions.id, submission.id));

      const { result } = await upgradeAsPreviewed(reservation.id, key);
      expect(result.success).toBe(true);
      // verification_payment is still owed, so both halves are `reserved`.
      expect((await readStand(kept.id)).status).toBe("reserved");
      expect((await readStand(companion.id)).status).toBe("reserved");
    });

    /**
     * Only a price change is judged against a submission: a half already
     * billed at the table price goes through, and its cobro is left alone.
     */
    it("lets an upgrade that keeps the price through a comprobante under review", async () => {
      const seeded = await seedFestival({
        userCount: 2,
        tables: [{ fullTablePrice: 450 }],
      });
      const [kept, companion] = seeded.tables[0].stands;
      const [owner, partner] = seeded.participants;
      const { reservation, invoice } = await seedReservation({
        festivalId: seeded.festival.id,
        standId: kept.id,
        ownerUserId: owner.id,
        status: "verification_payment",
        price: 450,
        sharedPrice: 450,
        participantUserIds: [owner.id, partner.id],
        invoiceStatus: "verification_payment",
      });
      await payInvoice({
        invoiceId: invoice.id,
        amount: 450,
        userId: owner.id,
        submissionStatus: "submitted",
      });
      const preview = await fetchFullTableUpgradePreview(reservation.id);
      expect(preview?.proofUnderReview).toBe(true);
      expect(preview?.plan?.priceChanged).toBe(false);
      expect(preview?.expected).toEqual({
        tablePrice: 450,
        settlementKind: "none",
        settlementAmount: 0,
      });
      const invoiceBefore = await readInvoice(invoice.id);

      const { result } = await upgradeAsPreviewed(reservation.id);
      expect(result).toMatchObject({
        success: true,
        data: { settlement: { kind: "none", amount: 0 } },
      });

      const invoiceAfter = await readInvoice(invoice.id);
      expect({
        amount: invoiceAfter.amount,
        originalAmount: invoiceAfter.originalAmount,
        discountAmount: invoiceAfter.discountAmount,
        status: invoiceAfter.status,
        dueAt: invoiceAfter.dueAt,
      }).toEqual({
        amount: invoiceBefore.amount,
        originalAmount: invoiceBefore.originalAmount,
        discountAmount: invoiceBefore.discountAmount,
        status: invoiceBefore.status,
        dueAt: invoiceBefore.dueAt,
      });
      const after = await readReservation(reservation.id);
      expect(after.status).toBe("verification_payment");
      expect(Number(after.priceAmountSnapshot)).toBe(450);
      expect(await readLiveMembers(reservation.id)).toHaveLength(2);
      expect((await readStand(kept.id)).status).toBe("reserved");
      expect((await readStand(companion.id)).status).toBe("reserved");
    });

    it("refuses a companion another reservation occupies, or a live hold covers", async () => {
      const seeded = await seedFestival({
        userCount: 3,
        tables: [{ fullTablePrice: 450 }, { fullTablePrice: 450 }],
      });
      const [owner, neighbour, holder] = seeded.participants;

      const [keptA, companionA] = seeded.tables[0].stands;
      const { reservation: taken } = await seedReservation({
        festivalId: seeded.festival.id,
        standId: keptA.id,
        ownerUserId: owner.id,
        price: 300,
      });
      await seedReservation({
        festivalId: seeded.festival.id,
        standId: companionA.id,
        ownerUserId: neighbour.id,
        price: 300,
      });
      expect(
        (await fetchFullTableUpgradePreview(taken.id))?.companionState,
      ).toBe("occupied");
      const takenBefore = await snapshot(taken.id, [keptA.id, companionA.id]);
      expect(
        await upgradeFullTableReservation({
          reservationId: taken.id,
          idempotencyKey: randomUUID(),
          expected: ANY_EXPECTATION,
        }),
      ).toEqual({
        success: false,
        code: "FULL_TABLE_COMPANION_TAKEN",
        message: "La otra mitad de la mesa ya está ocupada por otra reserva.",
      });
      expect(await snapshot(taken.id, [keptA.id, companionA.id])).toEqual(
        takenBefore,
      );

      const [keptB, companionB] = seeded.tables[1].stands;
      const { reservation: held } = await seedReservation({
        festivalId: seeded.festival.id,
        standId: keptB.id,
        ownerUserId: neighbour.id,
        price: 300,
      });
      const [hold] = await integrationDb!
        .insert(standHolds)
        .values({
          standId: companionB.id,
          userId: holder.id,
          festivalId: seeded.festival.id,
          expiresAt: new Date(Date.now() + 10 * 60_000),
        })
        .returning();
      await integrationDb!
        .insert(standHoldMembers)
        .values({ holdId: hold.id, standId: companionB.id, position: 0 })
        .onConflictDoNothing();
      expect(
        (await fetchFullTableUpgradePreview(held.id))?.companionState,
      ).toBe("held");
      const heldBefore = await snapshot(held.id, [keptB.id, companionB.id]);
      expect(
        await upgradeFullTableReservation({
          reservationId: held.id,
          idempotencyKey: randomUUID(),
          expected: ANY_EXPECTATION,
        }),
      ).toMatchObject({ success: false, code: "FULL_TABLE_COMPANION_HELD" });
      expect(await snapshot(held.id, [keptB.id, companionB.id])).toEqual(
        heldBefore,
      );
    });

    it("refuses a stand outside a priced two-stand table", async () => {
      const seeded = await seedFestival({
        userCount: 3,
        tables: [
          { fullTablePrice: null },
          { fullTablePrice: 450, standsInGroup: 3 },
        ],
        looseStands: [{ individual: 300 }],
      });
      const [loner, unpriced, malformed] = seeded.participants;
      const cases = [
        {
          standId: seeded.looseStands[0].id,
          ownerUserId: loner.id,
          preview: { inFullTableGroup: false, groupIssue: null },
        },
        {
          standId: seeded.tables[0].stands[0].id,
          ownerUserId: unpriced.id,
          preview: { inFullTableGroup: true, groupIssue: "unpriced" },
        },
        {
          standId: seeded.tables[1].stands[0].id,
          ownerUserId: malformed.id,
          preview: {
            inFullTableGroup: true,
            groupIssue: "malformed",
            companion: null,
          },
        },
      ];

      for (const testCase of cases) {
        const { reservation } = await seedReservation({
          festivalId: seeded.festival.id,
          standId: testCase.standId,
          ownerUserId: testCase.ownerUserId,
          price: 300,
        });
        const preview = await fetchFullTableUpgradePreview(reservation.id);
        expect(preview).toMatchObject({
          ...testCase.preview,
          plan: null,
          expected: null,
        });
        expect(
          await upgradeFullTableReservation({
            reservationId: reservation.id,
            idempotencyKey: randomUUID(),
            expected: ANY_EXPECTATION,
          }),
        ).toMatchObject({
          success: false,
          code: "FULL_TABLE_UPGRADE_NO_TABLE",
        });
        expect(await readLiveMembers(reservation.id)).toHaveLength(1);
      }
    });

    it("refuses a reservation that is already a full table or no longer live", async () => {
      const seeded = await seedFestival({
        userCount: 2,
        tables: [{ fullTablePrice: 450 }, { fullTablePrice: 450 }],
      });
      const [owner, other] = seeded.participants;

      const { reservation: full } = await seedReservation({
        festivalId: seeded.festival.id,
        standId: seeded.tables[0].stands[0].id,
        ownerUserId: owner.id,
        price: 300,
      });
      await upgradeAsPreviewed(full.id);
      expect(await fetchFullTableUpgradePreview(full.id)).toBeNull();
      expect(
        await upgradeFullTableReservation({
          reservationId: full.id,
          idempotencyKey: randomUUID(),
          expected: ANY_EXPECTATION,
        }),
      ).toEqual({
        success: false,
        code: "FULL_TABLE_NOT_UPGRADABLE",
        message:
          "Esta reserva no se puede ampliar: ya ocupa dos espacios o ya no ocupa ninguno.",
      });

      const { reservation: rejected } = await seedReservation({
        festivalId: seeded.festival.id,
        standId: seeded.tables[1].stands[0].id,
        ownerUserId: other.id,
        status: "rejected",
        price: 300,
      });
      expect(
        (await fetchFullTableUpgradePreview(rejected.id))?.reservationStatus,
      ).toBe("rejected");
      expect(
        await upgradeFullTableReservation({
          reservationId: rejected.id,
          idempotencyKey: randomUUID(),
          expected: ANY_EXPECTATION,
        }),
      ).toMatchObject({ success: false, code: "FULL_TABLE_NOT_UPGRADABLE" });
      expect(await readLiveMembers(rejected.id)).toHaveLength(1);
    });

    it.each(["festival_admin", "user"])(
      "refuses a %s, and shows a festival admin the preview",
      async (role) => {
        const seeded = await seedFestival({
          userCount: 1,
          tables: [{ fullTablePrice: 450 }],
        });
        const owner = seeded.participants[0];
        const { reservation } = await seedReservation({
          festivalId: seeded.festival.id,
          standId: seeded.tables[0].stands[0].id,
          ownerUserId: owner.id,
          price: 300,
        });
        currentProfileMock.mockResolvedValue({
          id: seeded.admin.id,
          role,
          status: "verified",
          category: "none",
        });

        const preview = await fetchFullTableUpgradePreview(reservation.id);
        if (role === "festival_admin") {
          expect(preview?.expected).toEqual({
            tablePrice: 450,
            settlementKind: "none",
            settlementAmount: 0,
          });
        } else {
          expect(preview).toBeNull();
        }

        expect(
          await upgradeFullTableReservation({
            reservationId: reservation.id,
            idempotencyKey: randomUUID(),
            expected: {
              tablePrice: 450,
              settlementKind: "none",
              settlementAmount: 0,
            },
          }),
        ).toMatchObject({ success: false, code: "UNAUTHORIZED" });
        expect(await readLiveMembers(reservation.id)).toHaveLength(1);
      },
    );

    it("replays an idempotent retry without adding the companion twice", async () => {
      const seeded = await seedFestival({
        userCount: 1,
        tables: [{ fullTablePrice: 450 }],
      });
      const [kept, companion] = seeded.tables[0].stands;
      const owner = seeded.participants[0];
      const { reservation } = await seedReservation({
        festivalId: seeded.festival.id,
        standId: kept.id,
        ownerUserId: owner.id,
        price: 300,
      });
      const key = randomUUID();
      const expected = (await fetchFullTableUpgradePreview(reservation.id))!
        .expected!;

      const first = await upgradeFullTableReservation({
        reservationId: reservation.id,
        idempotencyKey: key,
        expected,
      });
      const second = await upgradeFullTableReservation({
        reservationId: reservation.id,
        idempotencyKey: key,
        expected,
      });
      expect(first.success).toBe(true);
      expect(second).toEqual(first);
      expect(await readMembers(reservation.id)).toHaveLength(2);
      expect(await readUpgradeEvents(reservation.id)).toHaveLength(1);
      expect((await readLiveMembers(reservation.id))[1].standId).toBe(
        companion.id,
      );
    });
  });

  describe("membership history", () => {
    it("revives the released companion on a downgrade → upgrade round trip", async () => {
      const seeded = await seedFestival({
        userCount: 1,
        tables: [{ fullTablePrice: 450 }],
      });
      const [kept, companion] = seeded.tables[0].stands;
      const owner = seeded.participants[0];
      const { reservation, invoice } = await seedReservation({
        festivalId: seeded.festival.id,
        standId: kept.id,
        ownerUserId: owner.id,
        price: 300,
      });

      await upgradeAsPreviewed(reservation.id);
      expect(
        await downgradeFullTableReservation({
          reservationId: reservation.id,
          idempotencyKey: randomUUID(),
        }),
      ).toMatchObject({
        success: true,
        data: { keptStandId: kept.id, releasedStandId: companion.id },
      });
      expect(Number((await readInvoice(invoice.id)).amount)).toBe(300);
      expect(await readLiveMembers(reservation.id)).toHaveLength(1);

      const { result } = await upgradeAsPreviewed(reservation.id);
      expect(result.success).toBe(true);
      const members = await readMembers(reservation.id);
      // Still two rows: the released one came back rather than a duplicate.
      expect(
        members.map((member) => [
          member.standId,
          member.position,
          member.releasedAt,
        ]),
      ).toEqual([
        [kept.id, 0, null],
        [companion.id, 1, null],
      ]);
      expect(Number((await readInvoice(invoice.id)).amount)).toBe(450);
      expect((await readStand(companion.id)).status).toBe("reserved");

      // And the downgrade still works, keeping the half that was picked.
      expect(
        await downgradeFullTableReservation({
          reservationId: reservation.id,
          idempotencyKey: randomUUID(),
        }),
      ).toMatchObject({
        success: true,
        data: { keptStandId: kept.id, releasedStandId: companion.id },
      });
      expect(
        Number((await readReservation(reservation.id)).priceAmountSnapshot),
      ).toBe(300);
    });

    it("appends a new companion after a downgrade → switch, keeping the kept half lowest", async () => {
      const seeded = await seedFestival({
        userCount: 1,
        tables: [{ fullTablePrice: 450 }, { fullTablePrice: 450 }],
      });
      const [keptA, companionA] = seeded.tables[0].stands;
      const [keptB, companionB] = seeded.tables[1].stands;
      const owner = seeded.participants[0];
      const { reservation } = await seedReservation({
        festivalId: seeded.festival.id,
        standId: keptA.id,
        ownerUserId: owner.id,
        price: 300,
      });

      await upgradeAsPreviewed(reservation.id);
      await downgradeFullTableReservation({
        reservationId: reservation.id,
        idempotencyKey: randomUUID(),
      });
      expect(
        await changeReservationStand({
          reservationId: reservation.id,
          destinationStandId: keptB.id,
          idempotencyKey: randomUUID(),
        }),
      ).toMatchObject({ success: true });

      const { result } = await upgradeAsPreviewed(reservation.id);
      expect(result).toMatchObject({
        success: true,
        data: { keptStandId: keptB.id, addedStandId: companionB.id },
      });
      const members = await readMembers(reservation.id);
      expect(
        members.map((member) => [
          member.standId,
          member.position,
          member.releasedAt == null,
        ]),
      ).toEqual([
        [keptB.id, 0, true],
        [companionA.id, 1, false],
        [companionB.id, 2, true],
      ]);

      expect(
        await downgradeFullTableReservation({
          reservationId: reservation.id,
          idempotencyKey: randomUUID(),
        }),
      ).toMatchObject({
        success: true,
        data: { keptStandId: keptB.id, releasedStandId: companionB.id },
      });
    });

    it("takes a disabled companion, or one left `reserved` by nobody", async () => {
      const seeded = await seedFestival({
        userCount: 2,
        tables: [{ fullTablePrice: 450 }, { fullTablePrice: 450 }],
      });
      const [owner, other] = seeded.participants;
      const cases = [
        { table: seeded.tables[0], ownerUserId: owner.id, status: "disabled" },
        { table: seeded.tables[1], ownerUserId: other.id, status: "reserved" },
      ] as const;

      for (const testCase of cases) {
        const [kept, companion] = testCase.table.stands;
        await integrationDb!
          .update(stands)
          .set({ status: testCase.status })
          .where(eq(stands.id, companion.id));
        const { reservation } = await seedReservation({
          festivalId: seeded.festival.id,
          standId: kept.id,
          ownerUserId: testCase.ownerUserId,
          price: 300,
        });
        expect(
          (await fetchFullTableUpgradePreview(reservation.id))?.companionState,
        ).toBe("free");

        const { result } = await upgradeAsPreviewed(reservation.id);
        expect(result.success).toBe(true);
        expect((await readStand(companion.id)).status).toBe("reserved");
      }
    });
  });

  describe("snapshots and neighbours", () => {
    it("backfills a legacy null individual snapshot so a later downgrade prices the half", async () => {
      const seeded = await seedFestival({
        userCount: 1,
        tables: [{ fullTablePrice: 450, individual: 320 }],
      });
      const [kept] = seeded.tables[0].stands;
      const owner = seeded.participants[0];
      const { reservation, invoice } = await seedReservation({
        festivalId: seeded.festival.id,
        standId: kept.id,
        ownerUserId: owner.id,
        price: 300,
        individualPrice: null,
        sharedPrice: null,
      });

      await upgradeAsPreviewed(reservation.id);
      const upgraded = await readReservation(reservation.id);
      expect(Number(upgraded.individualPriceSnapshot)).toBe(320);
      // Never filled on its own: null is a legitimate shared snapshot.
      expect(upgraded.sharedPriceSnapshot).toBeNull();

      await downgradeFullTableReservation({
        reservationId: reservation.id,
        idempotencyKey: randomUUID(),
      });
      expect(
        Number((await readReservation(reservation.id)).priceAmountSnapshot),
      ).toBe(320);
      expect(Number((await readInvoice(invoice.id)).amount)).toBe(320);
    });

    it("leaves a participant's full-table access and its credit hold alone", async () => {
      const seeded = await seedFestival({
        userCount: 1,
        tables: [{ fullTablePrice: 450 }],
      });
      const [kept] = seeded.tables[0].stands;
      const owner = seeded.participants[0];
      const db = integrationDb!;
      const [action] = await db
        .insert(reservationFeatureActions)
        .values({
          festivalId: seeded.festival.id,
          ownerUserId: owner.id,
          type: "full_table_access",
          status: "active",
          featurePriceSnapshot: 40,
          idempotencyKey: `ftu-access-${randomUUID()}`,
        })
        .returning();
      await db.insert(creditHolds).values({
        userId: owner.id,
        festivalId: seeded.festival.id,
        amount: 40,
        purpose: "full_table_access",
        status: "active",
        featureActionId: action.id,
        idempotencyKey: `ftu-hold-${randomUUID()}`,
      });
      const { reservation } = await seedReservation({
        festivalId: seeded.festival.id,
        standId: kept.id,
        ownerUserId: owner.id,
        price: 300,
      });

      const { result } = await upgradeAsPreviewed(reservation.id);
      expect(result.success).toBe(true);

      const actions = await db
        .select()
        .from(reservationFeatureActions)
        .where(eq(reservationFeatureActions.festivalId, seeded.festival.id));
      expect(actions).toHaveLength(1);
      expect(actions[0]).toMatchObject({
        id: action.id,
        status: "active",
        reservationId: null,
      });
      const holds = await db
        .select()
        .from(creditHolds)
        .where(eq(creditHolds.featureActionId, action.id));
      expect(holds).toHaveLength(1);
      expect(holds[0].status).toBe("active");
      expect(await readLedger(owner.id)).toHaveLength(0);
    });

    it("keeps the table price when an admin removes the partner afterwards", async () => {
      const seeded = await seedFestival({
        userCount: 2,
        tables: [{ fullTablePrice: 450 }],
      });
      const [kept] = seeded.tables[0].stands;
      const [owner, partner] = seeded.participants;
      const { reservation, invoice } = await seedReservation({
        festivalId: seeded.festival.id,
        standId: kept.id,
        ownerUserId: owner.id,
        participantUserIds: [owner.id, partner.id],
        price: 500,
        individualPrice: 300,
        sharedPrice: 500,
      });
      await upgradeAsPreviewed(reservation.id);

      expect(
        await updateReservationPartner({
          reservationId: reservation.id,
          partnerUserId: null,
        }),
      ).toEqual({ success: true, message: "Compañero actualizado" });

      const edited = await readReservation(reservation.id);
      expect(edited.bookedParticipantCount).toBe(1);
      expect(Number(edited.priceAmountSnapshot)).toBe(450);
      expect(Number(edited.fullTablePriceSnapshot)).toBe(450);
      expect(Number((await readInvoice(invoice.id)).amount)).toBe(450);
    });
  });
});
