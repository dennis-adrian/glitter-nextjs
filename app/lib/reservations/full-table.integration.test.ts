// @vitest-environment node

import { randomUUID } from "crypto";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
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
import { summarizeReservationStands } from "@/app/lib/reservations/member-stands";
import { withMembershipReservations } from "@/app/lib/reservations/stand-occupancy";
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
  reservationFeatureActions,
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
let createStandHold: (typeof import("@/app/lib/reservations/hold-service"))["createStandHold"];
let confirmStandHold: (typeof import("@/app/lib/reservations/hold-service"))["confirmStandHold"];
let activateFullTableAccess: (typeof import("@/app/lib/reservations/full-table-service"))["activateFullTableAccess"];
let deactivateFullTableAccess: (typeof import("@/app/lib/reservations/full-table-service"))["deactivateFullTableAccess"];
let downgradeFullTableReservation: (typeof import("@/app/lib/reservations/full-table-service"))["downgradeFullTableReservation"];
let cancelReservation: (typeof import("@/app/lib/reservations/admin-service"))["cancelReservation"];
let publishedTermsVersionId: number;

const ACCESS_PRICE = 50;
const STAND_PRICE = 200;
const SHARED_PRICE = 320;

/**
 * The full-table path end to end (PRD §7): activation earmarks credits, a
 * two-stand hold becomes one reservation with two members and captures the
 * hold, and the half-table fallback releases it without charging.
 */
describeDatabase("full table", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl!;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";

    ({ createStandHold, confirmStandHold } =
      await import("@/app/lib/reservations/hold-service"));
    ({
      activateFullTableAccess,
      deactivateFullTableAccess,
      downgradeFullTableReservation,
    } = await import("@/app/lib/reservations/full-table-service"));
    ({ cancelReservation } =
      await import("@/app/lib/reservations/admin-service"));

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
        // The ledger is append-only in production, enforced by a trigger. The
        // trigger is dropped only for this delete and restored immediately, so
        // no test can run against a database that is missing it.
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

  async function seed(options?: {
    enabled?: boolean;
    userCount?: number;
    credits?: number;
    pairCount?: number;
    /** Extra unpaired stand, for the "no complete table" cases. */
    loneStand?: boolean;
  }) {
    const db = integrationDb!;
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const [festival] = await db
      .insert(festivals)
      .values({
        name: `Full Table ${suffix}`,
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

    const insertedUsers = await db
      .insert(users)
      .values(
        Array.from({ length: options?.userCount ?? 1 }, (_, index) => ({
          clerkId: `ft-${suffix}-${index}`,
          email: `ft-${suffix}-${index}@example.test`,
          displayName: `FT ${suffix}-${index}`,
          status: "verified" as const,
          category: "illustration" as const,
        })),
      )
      .returning();

    const enrollments = await db
      .insert(userRequests)
      .values(
        insertedUsers.map((user) => ({
          userId: user.id,
          festivalId: festival.id,
          type: "festival_participation" as const,
          status: "accepted" as const,
          termsVersionId: publishedTermsVersionId,
        })),
      )
      .returning();

    const pairCount = options?.pairCount ?? 1;
    const groupIds: number[] = [];
    const standIds: number[] = [];
    let standNumber = 1;
    for (let i = 0; i < pairCount; i += 1) {
      const [group] = await db
        .insert(standGroups)
        .values({
          festivalSectorId: sector.id,
          label: `T${i}-${suffix}`,
          type: "full_table" as const,
        })
        .returning();
      groupIds.push(group.id);
      const pairStands = await db
        .insert(stands)
        .values(
          Array.from({ length: 2 }, () => ({
            festivalId: festival.id,
            festivalSectorId: sector.id,
            standNumber: standNumber++,
            standCategory: "illustration" as const,
            status: "available" as const,
            price: STAND_PRICE,
            individualPrice: STAND_PRICE,
            // An illustration pair is only a valid full table when both halves
            // agree on both prices, so the fixture configures a real one.
            sharedPrice: SHARED_PRICE,
            standGroupId: group.id,
            positionLeft: 0,
            positionTop: 0,
          })),
        )
        .returning();
      standIds.push(...pairStands.map((stand) => stand.id));
    }

    if (options?.loneStand) {
      const [lone] = await db
        .insert(stands)
        .values({
          festivalId: festival.id,
          festivalSectorId: sector.id,
          standNumber: standNumber++,
          standCategory: "illustration" as const,
          status: "available" as const,
          price: STAND_PRICE,
          individualPrice: STAND_PRICE,
          positionLeft: 0,
          positionTop: 0,
        })
        .returning();
      standIds.push(lone.id);
    }

    if (options?.enabled !== false) {
      await db.insert(festivalReservationFeatures).values({
        festivalId: festival.id,
        type: "full_table" as const,
        category: "illustration" as const,
        enabled: true,
        creditPrice: ACCESS_PRICE,
      });
    }

    const credits = options?.credits ?? ACCESS_PRICE;
    if (credits > 0) {
      for (const user of insertedUsers) {
        await db.insert(creditLedgerEntries).values({
          userId: user.id,
          amount: credits,
          type: "admin_grant" as const,
          idempotencyKey: `grant-${suffix}-${user.id}`,
        });
      }
    }

    fixtures.push({
      festivalId: festival.id,
      sectorId: sector.id,
      groupIds,
      standIds,
      userIds: insertedUsers.map((user) => user.id),
      requestIds: enrollments.map((row) => row.id),
    });

    return { festival, sector, users: insertedUsers, standIds, groupIds };
  }

  function asUser(user: { id: number }) {
    currentProfileMock.mockResolvedValue({
      id: user.id,
      role: "user",
      status: "verified",
      category: "illustration",
    });
  }

  async function activeHoldAmount(userId: number) {
    const rows = await integrationDb!
      .select({ amount: creditHolds.amount, status: creditHolds.status })
      .from(creditHolds)
      .where(eq(creditHolds.userId, userId));
    return rows;
  }

  async function memberStandIds(reservationId: number) {
    const rows = await integrationDb!
      .select({ standId: standReservationStands.standId })
      .from(standReservationStands)
      .where(
        and(
          eq(standReservationStands.reservationId, reservationId),
          isNull(standReservationStands.releasedAt),
        ),
      );
    return rows.map((row) => row.standId).sort((a, b) => a - b);
  }

  it("activates access and earmarks the credits without spending them", async () => {
    const {
      festival,
      users: [owner],
    } = await seed();
    asUser(owner);

    const result = await activateFullTableAccess({
      festivalId: festival.id,
      idempotencyKey: randomUUID(),
    });

    expect(result.success).toBe(true);
    const holds = await activeHoldAmount(owner.id);
    expect(holds).toEqual([{ amount: ACCESS_PRICE, status: "active" }]);

    // A hold is an earmark, not a charge: the ledger is untouched.
    const spends = await integrationDb!
      .select({ id: creditLedgerEntries.id })
      .from(creditLedgerEntries)
      .where(
        and(
          eq(creditLedgerEntries.userId, owner.id),
          eq(creditLedgerEntries.type, "spend"),
        ),
      );
    expect(spends).toHaveLength(0);
  });

  it("replays an activation retry even after the feature is turned off", async () => {
    const {
      festival,
      users: [owner],
    } = await seed();
    asUser(owner);

    const key = randomUUID();
    const first = await activateFullTableAccess({
      festivalId: festival.id,
      idempotencyKey: key,
    });
    expect(first).toMatchObject({ success: true });
    const featureActionId = (first as { data: { featureActionId: number } })
      .data.featureActionId;

    // An admin disables the feature and reprices it between the call and the
    // participant's retry.
    await integrationDb!
      .update(festivalReservationFeatures)
      .set({ enabled: false, creditPrice: ACCESS_PRICE + 25 })
      .where(eq(festivalReservationFeatures.festivalId, festival.id));

    const replay = await activateFullTableAccess({
      festivalId: festival.id,
      idempotencyKey: key,
    });

    // The retry must return what the first call did, not fail on the new
    // configuration and not quote the new price.
    expect(replay).toMatchObject({
      success: true,
      data: { featureActionId, creditPrice: ACCESS_PRICE, alreadyActive: true },
    });

    // And it must not have taken a second hold.
    expect(await activeHoldAmount(owner.id)).toEqual([
      { amount: ACCESS_PRICE, status: "active" },
    ]);
  });

  it("refuses activation when the credits do not cover the price", async () => {
    const {
      festival,
      users: [owner],
    } = await seed({ credits: 10 });
    asUser(owner);

    const result = await activateFullTableAccess({
      festivalId: festival.id,
      idempotencyKey: randomUUID(),
    });

    expect(result).toMatchObject({
      success: false,
      code: "FULL_TABLE_INSUFFICIENT_CREDITS",
    });
    // The refused activation must leave nothing behind.
    expect(await activeHoldAmount(owner.id)).toHaveLength(0);
    const actions = await integrationDb!
      .select({ id: reservationFeatureActions.id })
      .from(reservationFeatureActions)
      .where(eq(reservationFeatureActions.festivalId, festival.id));
    expect(actions).toHaveLength(0);
  });

  it("refuses activation when no table has both halves free", async () => {
    const {
      festival,
      users: [owner],
      standIds,
    } = await seed();
    // Take one half out of circulation.
    await integrationDb!
      .update(stands)
      .set({ status: "confirmed" })
      .where(eq(stands.id, standIds[0]));
    asUser(owner);

    const result = await activateFullTableAccess({
      festivalId: festival.id,
      idempotencyKey: randomUUID(),
    });

    expect(result).toMatchObject({
      success: false,
      code: "FULL_TABLE_NONE_COMPLETE",
    });
  });

  it("refuses activation when the feature is not configured", async () => {
    const {
      festival,
      users: [owner],
    } = await seed({ enabled: false });
    asUser(owner);

    const result = await activateFullTableAccess({
      festivalId: festival.id,
      idempotencyKey: randomUUID(),
    });

    expect(result).toMatchObject({
      success: false,
      code: "FULL_TABLE_UNAVAILABLE",
    });
  });

  it("holds both halves and reserves them as one aggregate, capturing the credits", async () => {
    const {
      festival,
      users: [owner],
      standIds,
    } = await seed();
    asUser(owner);

    await activateFullTableAccess({
      festivalId: festival.id,
      idempotencyKey: randomUUID(),
    });

    const held = await createStandHold({
      standId: standIds[0],
      idempotencyKey: randomUUID(),
    });
    expect(held).toMatchObject({ success: true, data: { isFullTable: true } });

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

    // One reservation, two members — never two reservations.
    const reservations = await integrationDb!
      .select({ id: standReservations.id })
      .from(standReservations)
      .where(eq(standReservations.festivalId, festival.id));
    expect(reservations).toHaveLength(1);
    expect(await memberStandIds(reservationId)).toEqual(
      [standIds[0], standIds[1]].sort((a, b) => a - b),
    );

    // The hold is captured exactly once, and only the access price is spent.
    expect(await activeHoldAmount(owner.id)).toEqual([
      { amount: ACCESS_PRICE, status: "captured" },
    ]);
    const spends = await integrationDb!
      .select({ amount: creditLedgerEntries.amount })
      .from(creditLedgerEntries)
      .where(
        and(
          eq(creditLedgerEntries.userId, owner.id),
          eq(creditLedgerEntries.type, "spend"),
        ),
      );
    expect(spends).toEqual([{ amount: -ACCESS_PRICE }]);

    // The companion half is compensated by the feature price, not a second
    // stand invoice (PRD §7.6).
    const invoiceRows = await integrationDb!
      .select({ amount: invoices.amount })
      .from(invoices)
      .where(eq(invoices.reservationId, reservationId));
    expect(invoiceRows).toEqual([{ amount: STAND_PRICE }]);

    const action = await integrationDb!
      .select({
        status: reservationFeatureActions.status,
        reservationId: reservationFeatureActions.reservationId,
      })
      .from(reservationFeatureActions)
      .where(eq(reservationFeatureActions.festivalId, festival.id));
    expect(action).toEqual([{ status: "fulfilled", reservationId }]);
  });

  it("falls back to the selected half and frees the credits when the companion is gone", async () => {
    const {
      festival,
      users: [owner],
      standIds,
    } = await seed();
    asUser(owner);

    await activateFullTableAccess({
      festivalId: festival.id,
      idempotencyKey: randomUUID(),
    });

    // The companion goes while the participant is still choosing.
    await integrationDb!
      .update(stands)
      .set({ status: "confirmed" })
      .where(eq(stands.id, standIds[1]));

    const held = await createStandHold({
      standId: standIds[0],
      idempotencyKey: randomUUID(),
    });
    expect(held).toMatchObject({ success: true, data: { isFullTable: false } });

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
    expect(await memberStandIds(reservationId)).toEqual([standIds[0]]);

    // Nothing was charged: the credits go back to spendable.
    expect(await activeHoldAmount(owner.id)).toEqual([
      { amount: ACCESS_PRICE, status: "released" },
    ]);
    const spends = await integrationDb!
      .select({ id: creditLedgerEntries.id })
      .from(creditLedgerEntries)
      .where(
        and(
          eq(creditLedgerEntries.userId, owner.id),
          eq(creditLedgerEntries.type, "spend"),
        ),
      );
    expect(spends).toHaveLength(0);
  });

  it("frees both halves when a full-table hold is replaced", async () => {
    const {
      festival,
      users: [owner],
      standIds,
    } = await seed({ pairCount: 2 });
    asUser(owner);

    await activateFullTableAccess({
      festivalId: festival.id,
      idempotencyKey: randomUUID(),
    });
    const held = await createStandHold({
      standId: standIds[0],
      idempotencyKey: randomUUID(),
    });
    expect(held).toMatchObject({ success: true, data: { isFullTable: true } });

    // Moving to the other table replaces the hold. Releasing only the adapter
    // column would strand the companion as `held` with no hold row.
    await createStandHold({
      standId: standIds[2],
      idempotencyKey: randomUUID(),
    });

    const after = await integrationDb!
      .select({ id: stands.id, status: stands.status })
      .from(stands)
      .where(inArray(stands.id, [standIds[0], standIds[1]]));
    expect(after.map((row) => row.status)).toEqual(["available", "available"]);
  });

  it("refuses to deactivate access while a full table is held", async () => {
    const {
      festival,
      users: [owner],
      standIds,
    } = await seed();
    asUser(owner);

    await activateFullTableAccess({
      festivalId: festival.id,
      idempotencyKey: randomUUID(),
    });
    await createStandHold({
      standId: standIds[0],
      idempotencyKey: randomUUID(),
    });

    // Letting this through would hand over two stands billed as one, with no
    // credits captured at confirmation.
    const off = await deactivateFullTableAccess({
      festivalId: festival.id,
      idempotencyKey: randomUUID(),
    });
    expect(off).toMatchObject({
      success: false,
      code: "FULL_TABLE_HOLD_ACTIVE",
    });
    expect(await activeHoldAmount(owner.id)).toEqual([
      { amount: ACCESS_PRICE, status: "active" },
    ]);
  });

  it("deactivation releases the hold and stops claiming the companion", async () => {
    const {
      festival,
      users: [owner],
      standIds,
    } = await seed();
    asUser(owner);

    await activateFullTableAccess({
      festivalId: festival.id,
      idempotencyKey: randomUUID(),
    });
    const off = await deactivateFullTableAccess({
      festivalId: festival.id,
      idempotencyKey: randomUUID(),
    });
    expect(off.success).toBe(true);
    expect(await activeHoldAmount(owner.id)).toEqual([
      { amount: ACCESS_PRICE, status: "released" },
    ]);

    const held = await createStandHold({
      standId: standIds[0],
      idempotencyKey: randomUUID(),
    });
    expect(held).toMatchObject({ success: true, data: { isFullTable: false } });
  });

  it("reports both stands on the reservation detail query", async () => {
    const {
      festival,
      users: [owner],
      standIds,
    } = await seed();
    asUser(owner);

    await activateFullTableAccess({
      festivalId: festival.id,
      idempotencyKey: randomUUID(),
    });
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
    const reservationId = (confirmed as { data: { reservationId: number } })
      .data.reservationId;

    // The detail view reads membership, so the query behind it must carry both
    // halves — the parent stand_id names only the one that was picked first.
    const detail = await integrationDb!.query.standReservations.findFirst({
      where: eq(standReservations.id, reservationId),
      with: { members: { with: { stand: true } } },
    });

    expect(
      detail!.members.map((member) => member.standId).sort((a, b) => a - b),
    ).toEqual([standIds[0], standIds[1]].sort((a, b) => a - b));
    expect(detail!.members.every((member) => member.releasedAt === null)).toBe(
      true,
    );
    expect(
      summarizeReservationStands(
        detail!.members.map((member) => ({
          id: member.standId,
          label: member.stand.label,
          standNumber: member.stand.standNumber,
          standCategory: member.stand.standCategory,
          releasedAt: member.releasedAt,
          position: member.position,
        })),
      ),
    ).toMatchObject({ isFullTable: true, dimensions: "60cm x 240cm" });
  });

  it("marks both halves occupied for map and tooltip queries", async () => {
    const {
      festival,
      users: [owner],
      standIds,
    } = await seed();
    asUser(owner);

    await activateFullTableAccess({
      festivalId: festival.id,
      idempotencyKey: randomUUID(),
    });
    await createStandHold({
      standId: standIds[0],
      idempotencyKey: randomUUID(),
    });
    const [hold] = await integrationDb!
      .select({ id: standHolds.id })
      .from(standHolds)
      .where(eq(standHolds.festivalId, festival.id));
    await confirmStandHold({
      holdId: hold.id,
      idempotencyKey: randomUUID(),
    });

    // Maps and tooltips resolve occupancy through membership. Through the old
    // stands.reservations relation the companion half had no reservation at
    // all and showed as free.
    // The same shape the map and sector queries fetch: the stand's own
    // reservations plus flat membership, joined in memory.
    const standsWithMembers = await integrationDb!.query.stands.findMany({
      where: inArray(stands.id, standIds),
      with: { reservations: true, reservationMembers: true },
    });

    const occupancy = withMembershipReservations(standsWithMembers);
    expect(occupancy).toHaveLength(2);
    for (const stand of occupancy) {
      expect(stand.reservations).toHaveLength(1);
    }
    // Both halves belong to the same reservation, not two.
    expect(
      new Set(occupancy.map((stand) => stand.reservations[0]!.id)).size,
    ).toBe(1);
  });

  it("frees both stands when a full-table reservation is cancelled", async () => {
    const {
      festival,
      users: [owner],
      standIds,
    } = await seed();
    asUser(owner);

    await activateFullTableAccess({
      festivalId: festival.id,
      idempotencyKey: randomUUID(),
    });
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
    const reservationId = (confirmed as { data: { reservationId: number } })
      .data.reservationId;

    currentProfileMock.mockResolvedValue({
      id: owner.id,
      role: "admin",
      status: "verified",
      category: "illustration",
    });
    const cancelled = await cancelReservation({
      reservationId,
      reason: "test",
    });
    expect(cancelled.success).toBe(true);

    // Both halves must go back to the pool. Releasing only the parent's
    // stand_id would strand the companion as permanently unavailable.
    const after = await integrationDb!
      .select({ id: stands.id, status: stands.status })
      .from(stands)
      .where(inArray(stands.id, standIds));
    expect(after.map((row) => row.status)).toEqual(["available", "available"]);
  });

  it("downgrades a full table to its original half without touching the money", async () => {
    const {
      festival,
      users: [owner],
      standIds,
    } = await seed();
    asUser(owner);

    await activateFullTableAccess({
      festivalId: festival.id,
      idempotencyKey: randomUUID(),
    });
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
    const reservationId = (confirmed as { data: { reservationId: number } })
      .data.reservationId;

    currentProfileMock.mockResolvedValue({
      id: owner.id,
      role: "admin",
      status: "verified",
      category: "illustration",
    });
    const downgraded = await downgradeFullTableReservation({
      reservationId,
      idempotencyKey: randomUUID(),
    });

    expect(downgraded).toMatchObject({
      success: true,
      data: { keptStandId: standIds[0], releasedStandId: standIds[1] },
    });
    // The half the participant originally picked is the one that stays.
    expect(await memberStandIds(reservationId)).toEqual([standIds[0]]);

    const [companion] = await integrationDb!
      .select({ status: stands.status })
      .from(stands)
      .where(eq(stands.id, standIds[1]));
    expect(companion.status).toBe("available");

    // A downgrade is a capacity correction, never a refund: the captured
    // credits and the invoice are left exactly as they were.
    expect(await activeHoldAmount(owner.id)).toEqual([
      { amount: ACCESS_PRICE, status: "captured" },
    ]);
    const invoiceRows = await integrationDb!
      .select({ amount: invoices.amount })
      .from(invoices)
      .where(eq(invoices.reservationId, reservationId));
    expect(invoiceRows).toEqual([{ amount: STAND_PRICE }]);

    // The released member is retained as history, not deleted.
    const allMembers = await integrationDb!
      .select({ standId: standReservationStands.standId })
      .from(standReservationStands)
      .where(eq(standReservationStands.reservationId, reservationId));
    expect(allMembers).toHaveLength(2);
  });

  it("refuses to downgrade a reservation that is only half a table", async () => {
    const {
      festival,
      users: [owner],
      standIds,
    } = await seed();
    asUser(owner);

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
    const reservationId = (confirmed as { data: { reservationId: number } })
      .data.reservationId;

    currentProfileMock.mockResolvedValue({
      id: owner.id,
      role: "admin",
      status: "verified",
      category: "illustration",
    });
    const result = await downgradeFullTableReservation({
      reservationId,
      idempotencyKey: randomUUID(),
    });

    expect(result).toMatchObject({
      success: false,
      code: "FULL_TABLE_NOT_DOWNGRADABLE",
    });
  });

  it("gives the full table to exactly one of two racing participants", async () => {
    const {
      festival,
      users: [first, second],
      standIds,
    } = await seed({
      userCount: 2,
    });

    asUser(first);
    await activateFullTableAccess({
      festivalId: festival.id,
      idempotencyKey: randomUUID(),
    });
    asUser(second);
    await activateFullTableAccess({
      festivalId: festival.id,
      idempotencyKey: randomUUID(),
    });

    // Each picks a different half of the same table at the same time.
    currentProfileMock
      .mockResolvedValueOnce({
        id: first.id,
        role: "user",
        status: "verified",
        category: "illustration",
      })
      .mockResolvedValueOnce({
        id: second.id,
        role: "user",
        status: "verified",
        category: "illustration",
      });

    const [a, b] = await Promise.all([
      createStandHold({ standId: standIds[0], idempotencyKey: randomUUID() }),
      createStandHold({ standId: standIds[1], idempotencyKey: randomUUID() }),
    ]);

    const winners = [a, b].filter((result) => result.success);
    expect(winners).toHaveLength(1);
    // The winner takes the whole table, not just the half it asked for.
    expect(winners[0]).toMatchObject({ data: { isFullTable: true } });

    // Whatever the outcome, no stand is claimed by two holds.
    const memberRows = await integrationDb!
      .select({ standId: schema.standHoldMembers.standId })
      .from(schema.standHoldMembers)
      .where(inArray(schema.standHoldMembers.standId, standIds));
    const claimed = memberRows.map((row) => row.standId);
    expect(new Set(claimed).size).toBe(claimed.length);
  });
});
