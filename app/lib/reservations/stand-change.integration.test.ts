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
  invoices,
  payments,
  reservationParticipants,
  invoiceSettlementSubmissions,
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

const currentProfileMock = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: currentProfileMock,
  getCurrentBaseProfile: currentProfileMock,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

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

const ADMIN = { id: 0, role: "admin", status: "verified", category: "none" };

describeDatabase("admin stand switch and exchange", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl!;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";
    ({ changeReservationStand } =
      await import("@/app/lib/reservations/stand-change-service"));
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

  /**
   * Two sectors with differently priced stands, which is the case the feature
   * exists for: a cross-sector move that changes what the reservation costs.
   */
  async function seedFestival(input: {
    standPrices: { individual: number; shared?: number | null }[];
    userCount: number;
  }) {
    const db = integrationDb!;
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const [festival] = await db
      .insert(festivals)
      .values({
        name: `StandChange ${suffix}`,
        status: "active",
        festivalType: "glitter",
        reservationsStartDate: new Date(Date.now() - 60_000),
      })
      .returning();

    const [admin] = await db
      .insert(users)
      .values({
        clerkId: `sc-admin-${suffix}`,
        email: `sc-admin-${suffix}@example.test`,
        displayName: `SC Admin ${suffix}`,
        status: "verified",
        role: "admin",
      })
      .returning();

    const participants = await db
      .insert(users)
      .values(
        Array.from({ length: input.userCount }, (_, index) => ({
          clerkId: `sc-${suffix}-${index}`,
          email: `sc-${suffix}-${index}@example.test`,
          displayName: `SC ${suffix}-${index}`,
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

    const sectorRows = await db
      .insert(festivalSectors)
      .values([
        { name: `A ${suffix}`, festivalId: festival.id, orderInFestival: 1 },
        { name: `B ${suffix}`, festivalId: festival.id, orderInFestival: 2 },
      ])
      .returning();

    const standRows = await db
      .insert(stands)
      .values(
        input.standPrices.map((price, index) => ({
          festivalId: festival.id,
          festivalSectorId: sectorRows[index % 2].id,
          standNumber: index + 1,
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

    return { festival, admin, participants, sectors: sectorRows, standRows };
  }

  /** A live single-stand reservation with one invoice, built directly. */
  async function seedReservation(input: {
    festivalId: number;
    standId: number;
    ownerUserId: number;
    status?: "pending" | "verification_payment" | "accepted";
    price: number;
    sharedPrice?: number | null;
    standStatus?: "reserved" | "confirmed";
    discountAmount?: number;
    participantCount?: number;
    participantUserIds?: number[];
  }) {
    const db = integrationDb!;
    const status = input.status ?? "pending";
    const [reservation] = await db
      .insert(standReservations)
      .values({
        festivalId: input.festivalId,
        standId: input.standId,
        status,
        source: "admin_assignment",
        ownerUserId: input.ownerUserId,
        priceAmountSnapshot: input.price,
        individualPriceSnapshot: input.price,
        sharedPriceSnapshot: input.sharedPrice ?? null,
        bookedParticipantCount: input.participantCount ?? 1,
      })
      .returning();

    await db.insert(standReservationStands).values({
      reservationId: reservation.id,
      standId: input.standId,
      position: 0,
    });

    await db.insert(reservationParticipants).values(
      (input.participantUserIds ?? [input.ownerUserId]).map((userId) => ({
        userId,
        reservationId: reservation.id,
      })),
    );

    const discountAmount = input.discountAmount ?? 0;
    const [invoice] = await db
      .insert(invoices)
      .values({
        date: new Date(),
        userId: input.ownerUserId,
        reservationId: reservation.id,
        originalAmount: input.price,
        discountAmount,
        amount: input.price - discountAmount,
      })
      .returning();

    await db
      .update(stands)
      .set({ status: input.standStatus ?? "reserved" })
      .where(eq(stands.id, input.standId));

    return { reservation, invoice };
  }

  async function readReservation(id: number) {
    const db = integrationDb!;
    const [row] = await db
      .select()
      .from(standReservations)
      .where(eq(standReservations.id, id));
    return row;
  }

  async function readLiveMembers(reservationId: number) {
    const db = integrationDb!;
    return db
      .select()
      .from(standReservationStands)
      .where(
        and(
          eq(standReservationStands.reservationId, reservationId),
          isNull(standReservationStands.releasedAt),
        ),
      );
  }

  async function readInvoice(id: number) {
    const db = integrationDb!;
    const [row] = await db.select().from(invoices).where(eq(invoices.id, id));
    return row;
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
    await db
      .update(invoices)
      .set({ status: "paid" })
      .where(eq(invoices.id, input.invoiceId));
    return payment;
  }

  async function readLedger(userId: number) {
    const db = integrationDb!;
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

  async function readStand(id: number) {
    const db = integrationDb!;
    const [row] = await db.select().from(stands).where(eq(stands.id, id));
    return row;
  }

  describe("switch", () => {
    it("moves to a free stand across sectors and reprices every snapshot", async () => {
      const seeded = await seedFestival({
        standPrices: [{ individual: 300 }, { individual: 450, shared: 700 }],
        userCount: 1,
      });
      const [origin, destination] = seeded.standRows;
      const { reservation, invoice } = await seedReservation({
        festivalId: seeded.festival.id,
        standId: origin.id,
        ownerUserId: seeded.participants[0].id,
        price: 300,
      });

      const result = await changeReservationStand({
        reservationId: reservation.id,
        destinationStandId: destination.id,
        idempotencyKey: randomUUID(),
      });

      expect(result.success).toBe(true);
      if (!result.success) throw new Error(result.message);
      expect(result.data.mode).toBe("switch");
      expect(result.data.counterpartReservationId).toBeNull();

      const moved = await readReservation(reservation.id);
      expect(moved.standId).toBe(destination.id);
      expect(Number(moved.priceAmountSnapshot)).toBe(450);
      expect(Number(moved.individualPriceSnapshot)).toBe(450);
      expect(Number(moved.sharedPriceSnapshot)).toBe(700);

      const members = await readLiveMembers(reservation.id);
      expect(members).toHaveLength(1);
      expect(members[0].standId).toBe(destination.id);
      expect(members[0].position).toBe(0);

      const repriced = await readInvoice(invoice.id);
      expect(Number(repriced.originalAmount)).toBe(450);
      expect(Number(repriced.amount)).toBe(450);

      expect((await readStand(destination.id)).status).toBe("reserved");
      expect((await readStand(origin.id)).status).toBe("available");
    });

    it("carries the origin's stand status onto the destination", async () => {
      const seeded = await seedFestival({
        standPrices: [{ individual: 300 }, { individual: 300 }],
        userCount: 1,
      });
      const [origin, destination] = seeded.standRows;
      const { reservation } = await seedReservation({
        festivalId: seeded.festival.id,
        standId: origin.id,
        ownerUserId: seeded.participants[0].id,
        status: "accepted",
        price: 300,
        standStatus: "confirmed",
      });

      const result = await changeReservationStand({
        reservationId: reservation.id,
        destinationStandId: destination.id,
        idempotencyKey: randomUUID(),
      });
      expect(result.success).toBe(true);

      expect((await readStand(destination.id)).status).toBe("confirmed");
      expect((await readStand(origin.id)).status).toBe("available");
      expect((await readReservation(reservation.id)).status).toBe("accepted");
    });

    it("clamps a discount larger than the new price instead of inverting the total", async () => {
      const seeded = await seedFestival({
        standPrices: [{ individual: 500 }, { individual: 120 }],
        userCount: 1,
      });
      const [origin, destination] = seeded.standRows;
      const { reservation, invoice } = await seedReservation({
        festivalId: seeded.festival.id,
        standId: origin.id,
        ownerUserId: seeded.participants[0].id,
        price: 500,
        discountAmount: 300,
      });

      const result = await changeReservationStand({
        reservationId: reservation.id,
        destinationStandId: destination.id,
        idempotencyKey: randomUUID(),
      });
      expect(result.success).toBe(true);

      const repriced = await readInvoice(invoice.id);
      expect(Number(repriced.originalAmount)).toBe(120);
      expect(Number(repriced.discountAmount)).toBe(120);
      expect(Number(repriced.amount)).toBe(0);
    });

    it("survives a round trip back to the stand it started on", async () => {
      const seeded = await seedFestival({
        standPrices: [{ individual: 300 }, { individual: 300 }],
        userCount: 1,
      });
      const [origin, destination] = seeded.standRows;
      const { reservation } = await seedReservation({
        festivalId: seeded.festival.id,
        standId: origin.id,
        ownerUserId: seeded.participants[0].id,
        price: 300,
      });

      const out = await changeReservationStand({
        reservationId: reservation.id,
        destinationStandId: destination.id,
        idempotencyKey: randomUUID(),
      });
      expect(out.success).toBe(true);

      const back = await changeReservationStand({
        reservationId: reservation.id,
        destinationStandId: origin.id,
        idempotencyKey: randomUUID(),
      });
      expect(back.success).toBe(true);

      const members = await readLiveMembers(reservation.id);
      expect(members).toHaveLength(1);
      expect(members[0].standId).toBe(origin.id);
      expect((await readReservation(reservation.id)).standId).toBe(origin.id);
    });

    it("carries a balance when the new stand costs more than was paid", async () => {
      const seeded = await seedFestival({
        standPrices: [{ individual: 300 }, { individual: 450 }],
        userCount: 1,
      });
      const [origin, destination] = seeded.standRows;
      const { reservation, invoice } = await seedReservation({
        festivalId: seeded.festival.id,
        standId: origin.id,
        ownerUserId: seeded.participants[0].id,
        status: "accepted",
        price: 300,
        standStatus: "confirmed",
      });
      await payInvoice({
        invoiceId: invoice.id,
        amount: 300,
        userId: seeded.participants[0].id,
      });
      const before = new Date();

      const result = await changeReservationStand({
        reservationId: reservation.id,
        destinationStandId: destination.id,
        idempotencyKey: randomUUID(),
      });
      expect(result.success).toBe(true);

      const moved = await readReservation(reservation.id);
      // `accepted` means paid, and this one no longer is.
      expect(moved.status).toBe("pending");
      expect((await readStand(destination.id)).status).toBe("reserved");

      const repriced = await readInvoice(invoice.id);
      expect(Number(repriced.originalAmount)).toBe(450);
      expect(Number(repriced.amount)).toBe(450);
      expect(repriced.status).toBe("pending");

      // A fresh window measured from the move, not the original booking.
      expect(repriced.dueAt!.getTime()).toBeGreaterThan(before.getTime());
      const tasks = await readTasks(reservation.id);
      const open = tasks.filter((task) => task.completedAt === null);
      expect(open).toHaveLength(1);
      expect(open[0].dueDate.getTime()).toBeGreaterThan(before.getTime());
      expect(open[0].dueDate.getTime()).toBeGreaterThan(
        open[0].reminderTime.getTime(),
      );

      // Nothing was overpaid, so nothing is handed back.
      expect(await readLedger(seeded.participants[0].id)).toHaveLength(0);
    });

    it("refunds the surplus as credits when the new stand costs less", async () => {
      const seeded = await seedFestival({
        standPrices: [{ individual: 500 }, { individual: 300 }],
        userCount: 1,
      });
      const [origin, destination] = seeded.standRows;
      const { reservation, invoice } = await seedReservation({
        festivalId: seeded.festival.id,
        standId: origin.id,
        ownerUserId: seeded.participants[0].id,
        status: "accepted",
        price: 500,
        standStatus: "confirmed",
      });
      await payInvoice({
        invoiceId: invoice.id,
        amount: 500,
        userId: seeded.participants[0].id,
      });

      const result = await changeReservationStand({
        reservationId: reservation.id,
        destinationStandId: destination.id,
        idempotencyKey: randomUUID(),
      });
      expect(result.success).toBe(true);

      // Still paid: the cheaper stand is more than covered.
      const moved = await readReservation(reservation.id);
      expect(moved.status).toBe("accepted");
      expect((await readStand(destination.id)).status).toBe("confirmed");
      expect(Number((await readInvoice(invoice.id)).amount)).toBe(300);

      const ledger = await readLedger(seeded.participants[0].id);
      expect(ledger).toHaveLength(1);
      expect(Number(ledger[0].amount)).toBe(200);
      expect(ledger[0].type).toBe("admin_grant");
      expect((ledger[0].metadata as { reason: string }).reason).toContain(
        "Cambio de espacio",
      );

      // No balance, so no reopened deadline.
      expect(
        (await readTasks(reservation.id)).filter(
          (task) => task.completedAt === null,
        ),
      ).toHaveLength(0);
    });

    it("grants the refund once when the same request is retried", async () => {
      const seeded = await seedFestival({
        standPrices: [{ individual: 500 }, { individual: 300 }],
        userCount: 1,
      });
      const [origin, destination] = seeded.standRows;
      const { reservation, invoice } = await seedReservation({
        festivalId: seeded.festival.id,
        standId: origin.id,
        ownerUserId: seeded.participants[0].id,
        status: "accepted",
        price: 500,
        standStatus: "confirmed",
      });
      await payInvoice({
        invoiceId: invoice.id,
        amount: 500,
        userId: seeded.participants[0].id,
      });
      const key = randomUUID();

      await changeReservationStand({
        reservationId: reservation.id,
        destinationStandId: destination.id,
        idempotencyKey: key,
      });
      await changeReservationStand({
        reservationId: reservation.id,
        destinationStandId: destination.id,
        idempotencyKey: key,
      });

      const ledger = await readLedger(seeded.participants[0].id);
      expect(ledger).toHaveLength(1);
      expect(Number(ledger[0].amount)).toBe(200);
    });

    it("reuses the open payment task instead of opening a second one", async () => {
      const seeded = await seedFestival({
        standPrices: [{ individual: 300 }, { individual: 450 }],
        userCount: 1,
      });
      const [origin, destination] = seeded.standRows;
      const { reservation, invoice } = await seedReservation({
        festivalId: seeded.festival.id,
        standId: origin.id,
        ownerUserId: seeded.participants[0].id,
        price: 300,
      });
      await payInvoice({
        invoiceId: invoice.id,
        amount: 100,
        userId: seeded.participants[0].id,
      });
      // The clock the booking already started, still running.
      await integrationDb!.insert(scheduledTasks).values({
        dueDate: new Date(Date.now() + 60_000),
        reminderTime: new Date(Date.now() + 30_000),
        profileId: seeded.participants[0].id,
        reservationId: reservation.id,
        taskType: "stand_reservation",
      });

      const result = await changeReservationStand({
        reservationId: reservation.id,
        destinationStandId: destination.id,
        idempotencyKey: randomUUID(),
      });
      expect(result.success).toBe(true);

      const open = (await readTasks(reservation.id)).filter(
        (task) => task.completedAt === null,
      );
      expect(open).toHaveLength(1);
      // Two open tasks would mean two reminders for one balance.
      expect(open[0].dueDate.getTime()).toBeGreaterThan(Date.now() + 60_000);
    });

    it("does not refund a partial payer who moves somewhere cheaper", async () => {
      const seeded = await seedFestival({
        standPrices: [{ individual: 500 }, { individual: 300 }],
        userCount: 1,
      });
      const [origin, destination] = seeded.standRows;
      const { reservation, invoice } = await seedReservation({
        festivalId: seeded.festival.id,
        standId: origin.id,
        ownerUserId: seeded.participants[0].id,
        price: 500,
      });
      await payInvoice({
        invoiceId: invoice.id,
        amount: 200,
        userId: seeded.participants[0].id,
      });

      const result = await changeReservationStand({
        reservationId: reservation.id,
        destinationStandId: destination.id,
        idempotencyKey: randomUUID(),
      });
      expect(result.success).toBe(true);

      expect(await readLedger(seeded.participants[0].id)).toHaveLength(0);
      expect(Number((await readInvoice(invoice.id)).amount)).toBe(300);
    });

    it("allows an equal-price move even with a payment on the invoice", async () => {
      const seeded = await seedFestival({
        standPrices: [{ individual: 300 }, { individual: 300 }],
        userCount: 1,
      });
      const [origin, destination] = seeded.standRows;
      const { reservation, invoice } = await seedReservation({
        festivalId: seeded.festival.id,
        standId: origin.id,
        ownerUserId: seeded.participants[0].id,
        price: 300,
      });
      await integrationDb!.insert(payments).values({
        amount: 300,
        date: new Date(),
        invoiceId: invoice.id,
        voucherUrl: "/img/voucher.png",
      });

      const result = await changeReservationStand({
        reservationId: reservation.id,
        destinationStandId: destination.id,
        idempotencyKey: randomUUID(),
      });

      expect(result.success).toBe(true);
      expect((await readReservation(reservation.id)).standId).toBe(
        destination.id,
      );
      const untouched = await readInvoice(invoice.id);
      expect(Number(untouched.originalAmount)).toBe(300);
    });

    it("refuses a price change while a zero-value entitlement is under review", async () => {
      const seeded = await seedFestival({
        standPrices: [{ individual: 0 }, { individual: 450 }],
        userCount: 1,
      });
      const [origin, destination] = seeded.standRows;
      const { reservation, invoice } = await seedReservation({
        festivalId: seeded.festival.id,
        standId: origin.id,
        ownerUserId: seeded.participants[0].id,
        price: 0,
      });
      // No payment row and no credit allocation: a discount took this invoice
      // to zero, and the only trace is the submission itself.
      await integrationDb!.insert(invoiceSettlementSubmissions).values({
        invoiceId: invoice.id,
        kind: "zero_value_entitlement",
        status: "submitted",
        uploadedByUserId: seeded.participants[0].id,
      });

      const result = await changeReservationStand({
        reservationId: reservation.id,
        destinationStandId: destination.id,
        idempotencyKey: randomUUID(),
      });

      expect(result.success).toBe(false);
      if (result.success) throw new Error("expected a refusal");
      expect(result.code).toBe("STAND_CHANGE_PROOF_UNDER_REVIEW");
      expect((await readReservation(reservation.id)).standId).toBe(origin.id);
    });

    it("refuses to move a reservation holding two stands", async () => {
      const seeded = await seedFestival({
        standPrices: [
          { individual: 300 },
          { individual: 300 },
          { individual: 300 },
        ],
        userCount: 1,
      });
      const [origin, companion, destination] = seeded.standRows;
      const { reservation } = await seedReservation({
        festivalId: seeded.festival.id,
        standId: origin.id,
        ownerUserId: seeded.participants[0].id,
        price: 300,
      });
      await integrationDb!.insert(standReservationStands).values({
        reservationId: reservation.id,
        standId: companion.id,
        position: 1,
      });

      const result = await changeReservationStand({
        reservationId: reservation.id,
        destinationStandId: destination.id,
        idempotencyKey: randomUUID(),
      });

      expect(result.success).toBe(false);
      if (result.success) throw new Error("expected a refusal");
      expect(result.code).toBe("STAND_CHANGE_NOT_MOVABLE");
    });

    it("replays an idempotent retry without moving twice", async () => {
      const seeded = await seedFestival({
        standPrices: [{ individual: 300 }, { individual: 450 }],
        userCount: 1,
      });
      const [origin, destination] = seeded.standRows;
      const { reservation } = await seedReservation({
        festivalId: seeded.festival.id,
        standId: origin.id,
        ownerUserId: seeded.participants[0].id,
        price: 300,
      });
      const key = randomUUID();

      const first = await changeReservationStand({
        reservationId: reservation.id,
        destinationStandId: destination.id,
        idempotencyKey: key,
      });
      const second = await changeReservationStand({
        reservationId: reservation.id,
        destinationStandId: destination.id,
        idempotencyKey: key,
      });

      expect(first.success).toBe(true);
      expect(second.success).toBe(true);
      if (!second.success) throw new Error(second.message);
      expect(second.data.toStandId).toBe(destination.id);
      expect(await readLiveMembers(reservation.id)).toHaveLength(1);
    });
  });

  describe("exchange", () => {
    it("refuses an occupied destination until the admin confirms", async () => {
      const seeded = await seedFestival({
        standPrices: [{ individual: 300 }, { individual: 450 }],
        userCount: 2,
      });
      const [standA, standB] = seeded.standRows;
      const { reservation: first } = await seedReservation({
        festivalId: seeded.festival.id,
        standId: standA.id,
        ownerUserId: seeded.participants[0].id,
        price: 300,
      });
      await seedReservation({
        festivalId: seeded.festival.id,
        standId: standB.id,
        ownerUserId: seeded.participants[1].id,
        price: 450,
      });

      const result = await changeReservationStand({
        reservationId: first.id,
        destinationStandId: standB.id,
        idempotencyKey: randomUUID(),
      });

      expect(result.success).toBe(false);
      if (result.success) throw new Error("expected a refusal");
      expect(result.code).toBe("STAND_CHANGE_EXCHANGE_NOT_CONFIRMED");
      expect((await readReservation(first.id)).standId).toBe(standA.id);
    });

    it("swaps two reservations across sectors and reprices both", async () => {
      const seeded = await seedFestival({
        standPrices: [{ individual: 300 }, { individual: 450 }],
        userCount: 2,
      });
      const [standA, standB] = seeded.standRows;
      const { reservation: first, invoice: firstInvoice } =
        await seedReservation({
          festivalId: seeded.festival.id,
          standId: standA.id,
          ownerUserId: seeded.participants[0].id,
          price: 300,
        });
      const { reservation: second, invoice: secondInvoice } =
        await seedReservation({
          festivalId: seeded.festival.id,
          standId: standB.id,
          ownerUserId: seeded.participants[1].id,
          price: 450,
        });

      const result = await changeReservationStand({
        reservationId: first.id,
        destinationStandId: standB.id,
        idempotencyKey: randomUUID(),
        allowExchange: true,
      });

      expect(result.success).toBe(true);
      if (!result.success) throw new Error(result.message);
      expect(result.data.mode).toBe("exchange");
      expect(result.data.counterpartReservationId).toBe(second.id);

      expect((await readReservation(first.id)).standId).toBe(standB.id);
      expect((await readReservation(second.id)).standId).toBe(standA.id);
      expect(
        Number((await readReservation(first.id)).priceAmountSnapshot),
      ).toBe(450);
      expect(
        Number((await readReservation(second.id)).priceAmountSnapshot),
      ).toBe(300);
      expect(Number((await readInvoice(firstInvoice.id)).amount)).toBe(450);
      expect(Number((await readInvoice(secondInvoice.id)).amount)).toBe(300);
    });

    it("leaves one live member per reservation and no released history", async () => {
      const seeded = await seedFestival({
        standPrices: [{ individual: 300 }, { individual: 300 }],
        userCount: 2,
      });
      const [standA, standB] = seeded.standRows;
      const { reservation: first } = await seedReservation({
        festivalId: seeded.festival.id,
        standId: standA.id,
        ownerUserId: seeded.participants[0].id,
        price: 300,
      });
      const { reservation: second } = await seedReservation({
        festivalId: seeded.festival.id,
        standId: standB.id,
        ownerUserId: seeded.participants[1].id,
        price: 300,
      });

      const result = await changeReservationStand({
        reservationId: first.id,
        destinationStandId: standB.id,
        idempotencyKey: randomUUID(),
        allowExchange: true,
      });
      expect(result.success).toBe(true);

      const db = integrationDb!;
      const allMembers = await db
        .select()
        .from(standReservationStands)
        .where(
          inArray(standReservationStands.reservationId, [first.id, second.id]),
        );
      expect(allMembers).toHaveLength(2);
      expect(allMembers.every((member) => member.releasedAt === null)).toBe(
        true,
      );
      expect(allMembers.every((member) => member.position === 0)).toBe(true);
      expect(
        allMembers.find((member) => member.reservationId === first.id)!.standId,
      ).toBe(standB.id);
      expect(
        allMembers.find((member) => member.reservationId === second.id)!
          .standId,
      ).toBe(standA.id);
    });

    it("swaps the two stand statuses with their reservations", async () => {
      const seeded = await seedFestival({
        standPrices: [{ individual: 300 }, { individual: 300 }],
        userCount: 2,
      });
      const [standA, standB] = seeded.standRows;
      const { reservation: first } = await seedReservation({
        festivalId: seeded.festival.id,
        standId: standA.id,
        ownerUserId: seeded.participants[0].id,
        status: "accepted",
        price: 300,
        standStatus: "confirmed",
      });
      await seedReservation({
        festivalId: seeded.festival.id,
        standId: standB.id,
        ownerUserId: seeded.participants[1].id,
        price: 300,
        standStatus: "reserved",
      });

      const result = await changeReservationStand({
        reservationId: first.id,
        destinationStandId: standB.id,
        idempotencyKey: randomUUID(),
        allowExchange: true,
      });
      expect(result.success).toBe(true);

      expect((await readStand(standB.id)).status).toBe("confirmed");
      expect((await readStand(standA.id)).status).toBe("reserved");
    });

    it("resolves both sides at once: one owes a balance, the other gets credits", async () => {
      const seeded = await seedFestival({
        standPrices: [{ individual: 300 }, { individual: 450 }],
        userCount: 2,
      });
      const [standA, standB] = seeded.standRows;
      const { reservation: first, invoice: firstInvoice } =
        await seedReservation({
          festivalId: seeded.festival.id,
          standId: standA.id,
          ownerUserId: seeded.participants[0].id,
          status: "accepted",
          price: 300,
          standStatus: "confirmed",
        });
      const { reservation: second, invoice: secondInvoice } =
        await seedReservation({
          festivalId: seeded.festival.id,
          standId: standB.id,
          ownerUserId: seeded.participants[1].id,
          status: "accepted",
          price: 450,
          standStatus: "confirmed",
        });
      await payInvoice({
        invoiceId: firstInvoice.id,
        amount: 300,
        userId: seeded.participants[0].id,
      });
      await payInvoice({
        invoiceId: secondInvoice.id,
        amount: 450,
        userId: seeded.participants[1].id,
      });

      const result = await changeReservationStand({
        reservationId: first.id,
        destinationStandId: standB.id,
        idempotencyKey: randomUUID(),
        allowExchange: true,
      });
      expect(result.success).toBe(true);

      // Moved up: owes the difference, so it reopens.
      expect((await readReservation(first.id)).status).toBe("pending");
      expect(Number((await readInvoice(firstInvoice.id)).amount)).toBe(450);
      expect(await readLedger(seeded.participants[0].id)).toHaveLength(0);

      // Moved down: overpaid, so the surplus comes back as credits.
      expect((await readReservation(second.id)).status).toBe("accepted");
      expect(Number((await readInvoice(secondInvoice.id)).amount)).toBe(300);
      const refund = await readLedger(seeded.participants[1].id);
      expect(refund).toHaveLength(1);
      expect(Number(refund[0].amount)).toBe(150);
    });

    it("refuses an exchange while a voucher is under review", async () => {
      const seeded = await seedFestival({
        standPrices: [{ individual: 300 }, { individual: 450 }],
        userCount: 2,
      });
      const [standA, standB] = seeded.standRows;
      const { reservation: first } = await seedReservation({
        festivalId: seeded.festival.id,
        standId: standA.id,
        ownerUserId: seeded.participants[0].id,
        price: 300,
      });
      const { reservation: second, invoice: secondInvoice } =
        await seedReservation({
          festivalId: seeded.festival.id,
          standId: standB.id,
          ownerUserId: seeded.participants[1].id,
          price: 450,
        });
      const [payment] = await integrationDb!
        .insert(payments)
        .values({
          amount: 450,
          date: new Date(),
          invoiceId: secondInvoice.id,
          voucherUrl: "/img/voucher.png",
        })
        .returning();
      await integrationDb!.insert(invoiceSettlementSubmissions).values({
        invoiceId: secondInvoice.id,
        paymentId: payment.id,
        kind: "payment_proof",
        status: "submitted",
        uploadedByUserId: seeded.participants[1].id,
      });

      const result = await changeReservationStand({
        reservationId: first.id,
        destinationStandId: standB.id,
        idempotencyKey: randomUUID(),
        allowExchange: true,
      });

      expect(result.success).toBe(false);
      if (result.success) throw new Error("expected a refusal");
      expect(result.code).toBe("STAND_CHANGE_PROOF_UNDER_REVIEW");
      expect((await readReservation(first.id)).standId).toBe(standA.id);
      expect((await readReservation(second.id)).standId).toBe(standB.id);
    });

    it("writes an audit event on both reservations", async () => {
      const seeded = await seedFestival({
        standPrices: [{ individual: 300 }, { individual: 450 }],
        userCount: 2,
      });
      const [standA, standB] = seeded.standRows;
      const { reservation: first } = await seedReservation({
        festivalId: seeded.festival.id,
        standId: standA.id,
        ownerUserId: seeded.participants[0].id,
        price: 300,
      });
      const { reservation: second } = await seedReservation({
        festivalId: seeded.festival.id,
        standId: standB.id,
        ownerUserId: seeded.participants[1].id,
        price: 450,
      });

      await changeReservationStand({
        reservationId: first.id,
        destinationStandId: standB.id,
        idempotencyKey: randomUUID(),
        allowExchange: true,
      });

      const events = await integrationDb!
        .select()
        .from(standReservationEvents)
        .where(
          inArray(standReservationEvents.reservationId, [first.id, second.id]),
        );
      expect(events).toHaveLength(2);
      for (const event of events) {
        expect(event.eventType).toBe("status_changed");
        expect(event.fromStatus).toBe(event.toStatus);
        expect((event.payload as { action: string }).action).toBe(
          "stand_exchanged",
        );
      }
    });
  });
});
