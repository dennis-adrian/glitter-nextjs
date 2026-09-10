// @vitest-environment node

import { eq, inArray, sql } from "drizzle-orm";
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
  festivals,
  invoiceSettlementSubmissions,
  invoices,
  standReservationEvents,
  standReservations,
  stands,
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

let fetchReservationConsoleDetail: (typeof import("@/app/lib/reservations/console-detail"))["fetchReservationConsoleDetail"];

const ADMIN = { id: 0, role: "admin", status: "verified", category: "none" };

/**
 * The console history panel, against real Postgres.
 *
 * Both defects this file has produced were ordering and row-selection bugs that
 * no mock would reproduce: one picked an arbitrary invoice because the query had
 * no `ORDER BY`, the other let two events written by a single command come back
 * in either order. Only a real planner over real rows can show either.
 */
describeDatabase("reservation console detail", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl!;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";
    ({ fetchReservationConsoleDetail } =
      await import("@/app/lib/reservations/console-detail"));
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
          await db.delete(invoices).where(inArray(invoices.id, invoiceIds));
        }
        await db
          .delete(standReservationEvents)
          .where(inArray(standReservationEvents.reservationId, reservationIds));
        await db
          .delete(standReservations)
          .where(inArray(standReservations.id, reservationIds));
      }
      // Before the festival goes: `credit_ledger_entries.feature_action_id`
      // and `.user_id` are both `on delete restrict`, so a spend left standing
      // would block the cascade. The ledger is append-only in production,
      // enforced by a trigger; it is dropped only for this delete and restored
      // immediately, so no test runs against a database that is missing it.
      // Reversals go first — they point at the spend under the same rule.
      //
      // One transaction, so the ACCESS EXCLUSIVE lock `ALTER TABLE` takes is
      // held until the trigger is back: outside one, the lock drops the moment
      // the disable commits and a concurrent test file could append to an
      // unguarded ledger. A rollback reverts the disable too — DDL is
      // transactional here — so a failed delete cannot leave it off.
      const client = await pool!.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          "ALTER TABLE credit_ledger_entries DISABLE TRIGGER credit_ledger_entries_append_only",
        );
        await client.query(
          `DELETE FROM credit_ledger_entries
           WHERE user_id = ANY($1::int[]) AND reverses_entry_id IS NOT NULL`,
          [fixture.userIds],
        );
        await client.query(
          `DELETE FROM credit_ledger_entries WHERE user_id = ANY($1::int[])`,
          [fixture.userIds],
        );
        await client.query(
          "ALTER TABLE credit_ledger_entries ENABLE TRIGGER credit_ledger_entries_append_only",
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
      await db
        .delete(schema.reservationFeatureActions)
        .where(
          eq(schema.reservationFeatureActions.festivalId, fixture.festivalId),
        );

      await db.delete(stands).where(eq(stands.festivalId, fixture.festivalId));
      await db
        .delete(festivalSectors)
        .where(eq(festivalSectors.festivalId, fixture.festivalId));
      await db.delete(festivals).where(eq(festivals.id, fixture.festivalId));
      for (const userId of fixture.userIds) {
        await db.delete(users).where(eq(users.id, userId));
      }
    }
  });

  afterAll(async () => {
    await pool?.end();
  });

  /** One festival, one stand, one reservation, and the owner who holds it. */
  async function seedReservation() {
    const db = integrationDb!;
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const [festival] = await db
      .insert(festivals)
      .values({
        name: `ConsoleDetail ${suffix}`,
        status: "active",
        festivalType: "glitter",
        reservationsStartDate: new Date(Date.now() - 60_000),
      })
      .returning();

    const [owner] = await db
      .insert(users)
      .values({
        clerkId: `cd-${suffix}`,
        email: `cd-${suffix}@example.test`,
        displayName: `CD Owner ${suffix}`,
        status: "verified",
        category: "illustration",
      })
      .returning();

    const [sector] = await db
      .insert(festivalSectors)
      .values({
        name: `S ${suffix}`,
        festivalId: festival.id,
        orderInFestival: 1,
      })
      .returning();

    const [stand] = await db
      .insert(stands)
      .values({
        festivalId: festival.id,
        festivalSectorId: sector.id,
        standNumber: 1,
        standCategory: "illustration",
        status: "reserved",
        price: 350,
        individualPrice: 350,
      })
      .returning();

    const [reservation] = await db
      .insert(standReservations)
      .values({
        festivalId: festival.id,
        standId: stand.id,
        status: "pending",
        source: "admin_assignment",
        ownerUserId: owner.id,
        priceAmountSnapshot: 350,
        individualPriceSnapshot: 350,
      })
      .returning();

    fixtures.push({ festivalId: festival.id, userIds: [owner.id] });
    currentProfileMock.mockResolvedValue({ ...ADMIN, id: owner.id });

    return { festival, owner, stand, reservation };
  }

  async function addInvoice(input: {
    reservationId: number;
    userId: number;
    amount: number;
    status: "pending" | "paid" | "cancelled";
    createdAt: Date;
  }) {
    const db = integrationDb!;
    const [invoice] = await db
      .insert(invoices)
      .values({
        originalAmount: input.amount,
        discountAmount: 0,
        amount: input.amount,
        date: input.createdAt,
        status: input.status,
        userId: input.userId,
        reservationId: input.reservationId,
        createdAt: input.createdAt,
      })
      .returning();
    return invoice;
  }

  it("orders events a single command wrote by when they happened", async () => {
    const { owner, reservation } = await seedReservation();
    const db = integrationDb!;

    // `created_at` defaults to now(), which Postgres evaluates at transaction
    // start — so every event one command writes carries an identical timestamp,
    // not merely a close one. Settling a shortfall writes exactly this pair.
    const sharedCreatedAt = new Date("2026-09-09T12:00:00.000Z");
    const [statusChanged] = await db
      .insert(standReservationEvents)
      .values({
        reservationId: reservation.id,
        actorUserId: owner.id,
        eventType: "status_changed",
        fromStatus: "pending",
        toStatus: "verification_payment",
        payload: { step: "first" },
        createdAt: sharedCreatedAt,
      })
      .returning();
    const [approved] = await db
      .insert(standReservationEvents)
      .values({
        reservationId: reservation.id,
        actorUserId: owner.id,
        eventType: "settlement_approved",
        payload: { step: "second" },
        createdAt: sharedCreatedAt,
      })
      .returning();

    // Rewriting the earlier row moves its tuple, so an unordered scan is apt to
    // hand back the later event first. Without the `id` tiebreaker the panel
    // would then show the approval above the status change that caused it.
    await db
      .update(standReservationEvents)
      .set({ payload: { step: "first", touched: true } })
      .where(eq(standReservationEvents.id, statusChanged.id));

    const detail = await fetchReservationConsoleDetail(reservation.id);

    expect(detail).not.toBeNull();
    expect(detail!.events.map((event) => event.id)).toEqual([
      statusChanged.id,
      approved.id,
    ]);
    expect(detail!.events.map((event) => event.eventType)).toEqual([
      "status_changed",
      "settlement_approved",
    ]);
  });

  it("returns the history of every invoice on the reservation", async () => {
    const { owner, reservation } = await seedReservation();
    const db = integrationDb!;

    // A cancelled invoice beside a live one: the ordinary way a reservation
    // ends up with two, and what made reading only the first row lossy.
    const cancelled = await addInvoice({
      reservationId: reservation.id,
      userId: owner.id,
      amount: 200,
      status: "cancelled",
      createdAt: new Date("2026-08-30T12:00:00.000Z"),
    });
    const live = await addInvoice({
      reservationId: reservation.id,
      userId: owner.id,
      amount: 350,
      status: "pending",
      createdAt: new Date("2026-09-09T12:00:00.000Z"),
    });

    await db.insert(invoiceSettlementSubmissions).values([
      {
        invoiceId: cancelled.id,
        paymentId: null,
        uploadedByUserId: owner.id,
        kind: "zero_value_entitlement",
        status: "rejected",
        rejectionReason: "cobro reemplazado",
        createdAt: new Date("2026-08-30T12:05:00.000Z"),
      },
      {
        invoiceId: live.id,
        paymentId: null,
        uploadedByUserId: owner.id,
        kind: "zero_value_entitlement",
        status: "submitted",
        createdAt: new Date("2026-09-09T12:05:00.000Z"),
      },
    ]);

    const detail = await fetchReservationConsoleDetail(reservation.id);

    expect(detail).not.toBeNull();
    // Both invoices, oldest first — not whichever the scan reached first.
    expect(detail!.submissions.map((row) => row.status)).toEqual([
      "rejected",
      "submitted",
    ]);
    expect(detail!.submissions[0].rejectionReason).toBe("cobro reemplazado");
  });

  it("orders submissions that share a timestamp by insertion", async () => {
    const { owner, reservation } = await seedReservation();
    const db = integrationDb!;
    const invoice = await addInvoice({
      reservationId: reservation.id,
      userId: owner.id,
      amount: 350,
      status: "pending",
      createdAt: new Date("2026-09-09T12:00:00.000Z"),
    });

    const sameMoment = new Date("2026-09-09T12:30:00.000Z");
    const inserted = await db
      .insert(invoiceSettlementSubmissions)
      .values([
        {
          invoiceId: invoice.id,
          paymentId: null,
          uploadedByUserId: owner.id,
          kind: "zero_value_entitlement",
          status: "rejected",
          rejectionReason: "primero",
          createdAt: sameMoment,
        },
        {
          invoiceId: invoice.id,
          paymentId: null,
          uploadedByUserId: owner.id,
          kind: "zero_value_entitlement",
          status: "submitted",
          createdAt: sameMoment,
        },
      ])
      .returning({ id: invoiceSettlementSubmissions.id });

    await db
      .update(invoiceSettlementSubmissions)
      .set({ rejectionReason: "primero, reescrito" })
      .where(eq(invoiceSettlementSubmissions.id, inserted[0].id));

    const detail = await fetchReservationConsoleDetail(reservation.id);

    expect(detail!.submissions.map((row) => row.id)).toEqual(
      inserted.map((row) => row.id),
    );
  });

  it("tells a viewer who may not read admin reservation data nothing", async () => {
    const { reservation } = await seedReservation();
    currentProfileMock.mockResolvedValue({
      id: 1,
      role: "user",
      status: "verified",
      category: "illustration",
    });

    expect(await fetchReservationConsoleDetail(reservation.id)).toBeNull();
  });

  it("reports the credits a reservation spent on features, itemised", async () => {
    const { festival, owner, reservation } = await seedReservation();
    const db = integrationDb!;

    const [action] = await db
      .insert(schema.reservationFeatureActions)
      .values({
        festivalId: festival.id,
        reservationId: reservation.id,
        ownerUserId: owner.id,
        type: "late_partner",
        status: "fulfilled",
        featurePriceSnapshot: 20,
        individualPriceSnapshot: 370,
        sharedPriceSnapshot: 400,
      })
      .returning();
    await db.insert(schema.reservationFeatureActionItems).values([
      {
        featureActionId: action.id,
        kind: "shared_price_difference",
        amount: 30,
        descriptionSnapshot: "Diferencia",
      },
      { featureActionId: action.id, kind: "feature_access", amount: 20 },
    ]);
    await db.insert(schema.creditLedgerEntries).values({
      userId: owner.id,
      amount: -50,
      type: "spend",
      featureActionId: action.id,
      idempotencyKey: `cd-spend-${action.id}`,
    });

    const detail = await fetchReservationConsoleDetail(reservation.id);

    // Nothing was allocated to the cobro; the 50 credits bought the second
    // seat. Reading only allocations is what made this reservation look as
    // though it had been paid for one person.
    expect(detail!.allocations).toEqual([]);
    expect(detail!.featureCredits).toHaveLength(1);
    expect(detail!.featureCredits[0]).toMatchObject({
      type: "late_partner",
      amount: 50,
      reversed: false,
    });
    expect(
      detail!.featureCredits[0].items.map(({ kind, amount }) => ({
        kind,
        amount,
      })),
    ).toEqual([
      { kind: "shared_price_difference", amount: 30 },
      { kind: "feature_access", amount: 20 },
    ]);
  });

  it("charges nothing for a feature action whose spend never posted", async () => {
    const { festival, owner, reservation } = await seedReservation();
    const db = integrationDb!;

    // The ordinary shape of a full-table hold that was never captured: the
    // action row stands, priced, with no ledger entry behind it. Summing
    // `feature_price_snapshot` instead would invent a charge nobody paid.
    await db.insert(schema.reservationFeatureActions).values({
      festivalId: festival.id,
      reservationId: reservation.id,
      ownerUserId: owner.id,
      type: "full_table_access",
      status: "cancelled",
      featurePriceSnapshot: 20,
    });

    const detail = await fetchReservationConsoleDetail(reservation.id);

    expect(detail!.featureCredits).toHaveLength(1);
    expect(detail!.featureCredits[0]).toMatchObject({ amount: 0, items: [] });
  });

  it("marks a feature spend that was later refunded as reversed", async () => {
    const { festival, owner, reservation } = await seedReservation();
    const db = integrationDb!;

    const [action] = await db
      .insert(schema.reservationFeatureActions)
      .values({
        festivalId: festival.id,
        reservationId: reservation.id,
        ownerUserId: owner.id,
        type: "reservation_release",
        status: "fulfilled",
        featurePriceSnapshot: 20,
      })
      .returning();
    const [spend] = await db
      .insert(schema.creditLedgerEntries)
      .values({
        userId: owner.id,
        amount: -20,
        type: "spend",
        featureActionId: action.id,
        idempotencyKey: `cd-spend-rev-${action.id}`,
      })
      .returning();
    await db.insert(schema.creditLedgerEntries).values({
      userId: owner.id,
      amount: 20,
      type: "admin_adjustment",
      reversesEntryId: spend.id,
      idempotencyKey: `cd-refund-${action.id}`,
    });

    const detail = await fetchReservationConsoleDetail(reservation.id);

    // Same predicate the tender uses for a released allocation, so a refunded
    // feature reads the same way a returned credit does.
    expect(detail!.featureCredits[0]).toMatchObject({
      amount: 20,
      reversed: true,
    });
  });

  it("returns empty history for a reservation with no invoice", async () => {
    const { reservation } = await seedReservation();

    const detail = await fetchReservationConsoleDetail(reservation.id);

    // The invoice-scoped queries are skipped entirely rather than run against
    // an empty id list, so this asserts that path still answers. Feature
    // credits are keyed by reservation, not invoice, so they are queried even
    // here — and come back empty because this reservation bought no extras.
    expect(detail).toEqual({
      featureCredits: [],
      allocations: [],
      submissions: [],
      events: [],
    });
  });

  it("keeps every event row it was given", async () => {
    const { owner, reservation } = await seedReservation();
    const db = integrationDb!;
    const values = Array.from({ length: 5 }, (_, index) => ({
      reservationId: reservation.id,
      actorUserId: owner.id,
      eventType: "status_changed" as const,
      payload: { index },
      createdAt: new Date("2026-09-09T12:00:00.000Z"),
    }));
    const inserted = await db
      .insert(standReservationEvents)
      .values(values)
      .returning({ id: standReservationEvents.id });

    // Perturb the heap so an unordered scan would not match insertion order.
    await db
      .update(standReservationEvents)
      .set({ payload: sql`jsonb_build_object('index', 0, 'touched', true)` })
      .where(eq(standReservationEvents.id, inserted[0].id));

    const detail = await fetchReservationConsoleDetail(reservation.id);

    expect(detail!.events.map((event) => event.id)).toEqual(
      inserted.map((row) => row.id),
    );
  });
});
