// @vitest-environment node

import { randomUUID } from "crypto";
import { asc, eq, inArray } from "drizzle-orm";
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

const currentProfileMock = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: currentProfileMock,
  getCurrentBaseProfile: currentProfileMock,
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

let createAdminReservation: (typeof import("@/app/lib/reservations/admin-actions"))["createAdminReservation"];

/**
 * An admin assigning a full table is an allocation, not a purchase (PRD §6.3).
 * These run against real Postgres because the things that must *not* happen —
 * no feature action, no credit hold, no ledger entry — are absences in tables
 * a mocked transaction would never touch either way.
 */
describeDatabase("admin full-table assignment", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl!;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";
    ({ createAdminReservation } =
      await import("@/app/lib/reservations/admin-actions"));
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
        await db
          .delete(standReservationStands)
          .where(inArray(standReservationStands.reservationId, reservationIds));
        await db
          .delete(standReservations)
          .where(inArray(standReservations.id, reservationIds));
      }
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
      for (const userId of fixture.userIds) {
        await db.delete(userRequests).where(eq(userRequests.userId, userId));
        await db
          .delete(reservationRequestRegistry)
          .where(eq(reservationRequestRegistry.actorUserId, userId));
        await db
          .delete(creditLedgerEntries)
          .where(eq(creditLedgerEntries.userId, userId));
        await db.delete(users).where(eq(users.id, userId));
      }
      await db.delete(festivals).where(eq(festivals.id, fixture.festivalId));
    }
  });

  afterAll(async () => {
    await pool?.end();
  });

  async function seed(input: {
    /** Null leaves the table unpriced, which withholds it as inventory. */
    fullTablePrice: number | null;
    standsInGroup?: number;
  }) {
    const db = integrationDb!;
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const [festival] = await db
      .insert(festivals)
      .values({
        name: `AdminTable ${suffix}`,
        status: "active",
        festivalType: "glitter",
        reservationsStartDate: new Date(Date.now() - 60_000),
      })
      .returning();

    const [admin] = await db
      .insert(users)
      .values({
        clerkId: `at-admin-${suffix}`,
        email: `at-admin-${suffix}@example.test`,
        displayName: `AT Admin ${suffix}`,
        status: "verified",
        role: "admin",
      })
      .returning();

    const [participant] = await db
      .insert(users)
      .values({
        clerkId: `at-user-${suffix}`,
        email: `at-user-${suffix}@example.test`,
        displayName: `AT User ${suffix}`,
        status: "verified",
        category: "illustration",
      })
      .returning();

    await db.insert(userRequests).values({
      userId: participant.id,
      festivalId: festival.id,
      type: "festival_participation",
      status: "accepted",
    });

    const [sector] = await db
      .insert(festivalSectors)
      .values({
        name: `S ${suffix}`,
        festivalId: festival.id,
        orderInFestival: 1,
      })
      .returning();

    const [group] = await db
      .insert(standGroups)
      .values({
        festivalSectorId: sector.id,
        type: "full_table",
        fullTablePrice: input.fullTablePrice,
      })
      .returning();

    const standRows = await db
      .insert(stands)
      .values(
        Array.from({ length: input.standsInGroup ?? 2 }, (_, index) => ({
          festivalId: festival.id,
          festivalSectorId: sector.id,
          standGroupId: group.id,
          standNumber: index + 1,
          standCategory: "illustration" as const,
          status: "available" as const,
          price: 300,
          individualPrice: 300,
          sharedPrice: 500,
        })),
      )
      .returning();

    fixtures.push({
      festivalId: festival.id,
      userIds: [admin.id, participant.id],
    });
    currentProfileMock.mockResolvedValue({
      id: admin.id,
      role: "admin",
      status: "verified",
      category: "none",
    });

    return { festival, admin, participant, group, standRows };
  }

  it("assigns both halves, bills the table price, and spends no credits", async () => {
    const seeded = await seed({ fullTablePrice: 800 });
    const db = integrationDb!;

    const result = await createAdminReservation({
      festivalId: seeded.festival.id,
      standId: seeded.standRows[0].id,
      ownerUserId: seeded.participant.id,
      idempotencyKey: randomUUID(),
      fullTable: true,
    });

    expect(result.success).toBe(true);
    const reservationId = result.reservationId!;

    const [reservation] = await db
      .select()
      .from(standReservations)
      .where(eq(standReservations.id, reservationId));
    expect(Number(reservation.fullTablePriceSnapshot)).toBe(800);
    expect(Number(reservation.priceAmountSnapshot)).toBe(800);
    // The picked half's own prices stay on record: the manual downgrade
    // prices the surviving half from them.
    expect(Number(reservation.individualPriceSnapshot)).toBe(300);
    expect(Number(reservation.sharedPriceSnapshot)).toBe(500);

    const members = await db
      .select()
      .from(standReservationStands)
      .where(eq(standReservationStands.reservationId, reservationId))
      .orderBy(asc(standReservationStands.position));
    expect(members).toHaveLength(2);
    expect(members[0].standId).toBe(seeded.standRows[0].id);
    expect(members[1].standId).toBe(seeded.standRows[1].id);

    const standRows = await db
      .select()
      .from(stands)
      .where(
        inArray(
          stands.id,
          seeded.standRows.map((stand) => stand.id),
        ),
      );
    expect(standRows.every((stand) => stand.status === "reserved")).toBe(true);

    const invoiceRows = await db
      .select()
      .from(invoices)
      .where(eq(invoices.reservationId, reservationId));
    expect(invoiceRows).toHaveLength(1);
    expect(Number(invoiceRows[0].originalAmount)).toBe(800);
    expect(Number(invoiceRows[0].amount)).toBe(800);

    const featureActions = await db
      .select()
      .from(reservationFeatureActions)
      .where(eq(reservationFeatureActions.festivalId, seeded.festival.id));
    expect(featureActions).toHaveLength(0);

    const ledger = await db
      .select()
      .from(creditLedgerEntries)
      .where(eq(creditLedgerEntries.userId, seeded.participant.id));
    expect(ledger).toHaveLength(0);
  });

  it("refuses a table with no price, because it is not inventory", async () => {
    const seeded = await seed({ fullTablePrice: null });

    const result = await createAdminReservation({
      festivalId: seeded.festival.id,
      standId: seeded.standRows[0].id,
      ownerUserId: seeded.participant.id,
      idempotencyKey: randomUUID(),
      fullTable: true,
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain("mesa completa");
  });

  it("refuses a malformed group that is not exactly two stands", async () => {
    const seeded = await seed({ fullTablePrice: 800, standsInGroup: 3 });

    const result = await createAdminReservation({
      festivalId: seeded.festival.id,
      standId: seeded.standRows[0].id,
      ownerUserId: seeded.participant.id,
      idempotencyKey: randomUUID(),
      fullTable: true,
    });

    expect(result.success).toBe(false);
  });

  it("refuses when the companion half is already taken", async () => {
    const seeded = await seed({ fullTablePrice: 800 });
    const db = integrationDb!;

    const [blocking] = await db
      .insert(standReservations)
      .values({
        festivalId: seeded.festival.id,
        standId: seeded.standRows[1].id,
        status: "pending",
        source: "admin_assignment",
        ownerUserId: seeded.participant.id,
        priceAmountSnapshot: 300,
      })
      .returning();
    await db.insert(standReservationStands).values({
      reservationId: blocking.id,
      standId: seeded.standRows[1].id,
      position: 0,
    });

    const result = await createAdminReservation({
      festivalId: seeded.festival.id,
      standId: seeded.standRows[0].id,
      ownerUserId: seeded.participant.id,
      idempotencyKey: randomUUID(),
      fullTable: true,
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain("mitad");
  });

  it("still assigns a single stand when the flag is absent", async () => {
    const seeded = await seed({ fullTablePrice: 800 });
    const db = integrationDb!;

    const result = await createAdminReservation({
      festivalId: seeded.festival.id,
      standId: seeded.standRows[0].id,
      ownerUserId: seeded.participant.id,
      idempotencyKey: randomUUID(),
    });

    expect(result.success).toBe(true);
    const members = await db
      .select()
      .from(standReservationStands)
      .where(eq(standReservationStands.reservationId, result.reservationId!));
    expect(members).toHaveLength(1);

    const [reservation] = await db
      .select()
      .from(standReservations)
      .where(eq(standReservations.id, result.reservationId!));
    expect(reservation.fullTablePriceSnapshot).toBeNull();
    expect(Number(reservation.priceAmountSnapshot)).toBe(300);
  });

  it("assigns a table to a participant who already holds a reservation", async () => {
    const seeded = await seed({ fullTablePrice: 800 });
    const db = integrationDb!;

    const [existingStand] = await db
      .insert(stands)
      .values({
        festivalId: seeded.festival.id,
        standNumber: 99,
        standCategory: "illustration",
        status: "available",
        price: 300,
        individualPrice: 300,
      })
      .returning();
    const first = await createAdminReservation({
      festivalId: seeded.festival.id,
      standId: existingStand.id,
      ownerUserId: seeded.participant.id,
      idempotencyKey: randomUUID(),
    });
    expect(first.success).toBe(true);

    const second = await createAdminReservation({
      festivalId: seeded.festival.id,
      standId: seeded.standRows[0].id,
      ownerUserId: seeded.participant.id,
      idempotencyKey: randomUUID(),
      fullTable: true,
    });

    expect(second.success).toBe(true);
    expect(second.reservationId).not.toBe(first.reservationId);
  });
});
