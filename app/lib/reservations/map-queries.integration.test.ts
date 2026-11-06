// @vitest-environment node

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
import type { FullTableOffer } from "@/app/lib/reservations/full-table-queries";
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
  standReservations,
  stands,
  userRequests,
  users,
} from "@/db/schema";

const currentProfileMock = vi.hoisted(() => vi.fn());
/**
 * Every row in `users` has a non-null category (`none` by default), so the
 * map's "no stand category" early return cannot be reached through the
 * database alone; this switch forces it.
 */
const standMatchOverride = vi.hoisted(() => ({ forceNull: false }));

vi.mock("server-only", () => ({}));
vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: currentProfileMock,
  getCurrentBaseProfile: currentProfileMock,
}));
vi.mock("@/app/lib/reservations/notification-outbox", () => ({
  enqueueAdminAndOwnerNotifications: vi.fn().mockResolvedValue([]),
  enqueueReservationNotification: vi.fn(),
  enqueueReservationNotifications: vi.fn().mockResolvedValue([]),
  scheduleReservationNotificationJobs: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/lib/reservations/policy", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/app/lib/reservations/policy")>();
  return {
    ...actual,
    profileCategoryForStandMatch: (category: string | null | undefined) =>
      standMatchOverride.forceNull
        ? null
        : actual.profileCategoryForStandMatch(category),
  };
});

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
let activateFullTableAccess: (typeof import("@/app/lib/reservations/full-table-service"))["activateFullTableAccess"];
let fetchFestivalReservationMapDto: (typeof import("@/app/lib/reservations/map-queries"))["fetchFestivalReservationMapDto"];
let publishedTermsVersionId: number;

const ACCESS_PRICE = 50;
const STAND_PRICE = 200;
const SHARED_PRICE = 320;
const FULL_TABLE_PRICE = 380;
/** Deliberately not ACCESS_PRICE, so the map is seen quoting the offer. */
const OFFER_PRICE = 75;

function activationOffer(
  overrides: Partial<FullTableOffer> = {},
): FullTableOffer {
  return {
    offered: true,
    active: false,
    creditPrice: OFFER_PRICE,
    spendableBalance: OFFER_PRICE,
    shortfall: 0,
    hasCompleteTable: true,
    blockedReason: null,
    lowestTablePrice: FULL_TABLE_PRICE,
    ...overrides,
  };
}

/**
 * The participant's reservation map (`fetchFestivalReservationMapDto`): what it
 * shows of their own hold, which stands it marks as full-table halves, and
 * when it quotes the full-table activation fee.
 */
describeDatabase("reservation map DTO", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl!;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";

    ({ createStandHold } = await import("@/app/lib/reservations/hold-service"));
    ({ activateFullTableAccess } =
      await import("@/app/lib/reservations/full-table-service"));
    ({ fetchFestivalReservationMapDto } =
      await import("@/app/lib/reservations/map-queries"));

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
    standMatchOverride.forceNull = false;
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
    category?: "illustration" | "none";
    /** Extra illustration stand outside any group. */
    loneStand?: boolean;
  }) {
    const db = integrationDb!;
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const [festival] = await db
      .insert(festivals)
      .values({
        name: `Map DTO ${suffix}`,
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

    const [owner] = await db
      .insert(users)
      .values({
        clerkId: `map-${suffix}`,
        email: `map-${suffix}@example.test`,
        displayName: `Map ${suffix}`,
        status: "verified" as const,
        category: options?.category ?? ("illustration" as const),
      })
      .returning();

    const enrollments = await db
      .insert(userRequests)
      .values({
        userId: owner.id,
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
        [1, 2].map((standNumber) => ({
          festivalId: festival.id,
          festivalSectorId: sector.id,
          standNumber,
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
    const standIds = pairStands.map((stand) => stand.id);

    let loneStandId: number | null = null;
    if (options?.loneStand) {
      const [lone] = await db
        .insert(stands)
        .values({
          festivalId: festival.id,
          festivalSectorId: sector.id,
          standNumber: 3,
          standCategory: "illustration" as const,
          status: "available" as const,
          price: STAND_PRICE,
          individualPrice: STAND_PRICE,
          positionLeft: 0,
          positionTop: 0,
        })
        .returning();
      loneStandId = lone.id;
    }

    await db.insert(festivalReservationFeatures).values({
      festivalId: festival.id,
      type: "full_table" as const,
      category: "illustration" as const,
      enabled: true,
      creditPrice: ACCESS_PRICE,
    });

    await db.insert(creditLedgerEntries).values({
      userId: owner.id,
      amount: ACCESS_PRICE,
      type: "admin_grant" as const,
      idempotencyKey: `grant-${suffix}-${owner.id}`,
    });

    fixtures.push({
      festivalId: festival.id,
      sectorId: sector.id,
      groupIds: [group.id],
      standIds: loneStandId == null ? standIds : [...standIds, loneStandId],
      userIds: [owner.id],
      requestIds: enrollments.map((row) => row.id),
    });

    return { festival, sector, owner, group, standIds, loneStandId };
  }

  function asUser(user: { id: number }) {
    currentProfileMock.mockResolvedValue({
      id: user.id,
      role: "user",
      status: "verified",
      category: "illustration",
    });
  }

  async function activate(festivalId: number) {
    const result = await activateFullTableAccess({
      festivalId,
      idempotencyKey: randomUUID(),
    });
    expect(result.success).toBe(true);
  }

  function mapStands(
    dto: Awaited<ReturnType<typeof fetchFestivalReservationMapDto>>,
  ) {
    return dto?.sectors.flatMap((sector) => sector.stands) ?? [];
  }

  it("shows the viewer's own full-table hold with both halves", async () => {
    const { festival, owner, standIds } = await seed();
    asUser(owner);
    await activate(festival.id);

    const held = await createStandHold({
      standId: standIds[0],
      idempotencyKey: randomUUID(),
    });
    expect(held).toMatchObject({ success: true, data: { isFullTable: true } });

    const [hold] = await integrationDb!
      .select({
        id: standHolds.id,
        standId: standHolds.standId,
        expiresAt: standHolds.expiresAt,
      })
      .from(standHolds)
      .where(eq(standHolds.festivalId, festival.id));

    const dto = await fetchFestivalReservationMapDto({
      festivalId: festival.id,
      profileId: owner.id,
      revealHiddenIdentities: false,
    });

    expect(dto?.activeHold).toMatchObject({
      id: hold.id,
      standId: hold.standId,
      expiresAt: hold.expiresAt.toISOString(),
    });
    expect(dto?.activeHold?.standId).toBe(standIds[0]);
    expect(
      [...(dto?.activeHold?.standIds ?? [])].sort((a, b) => a - b),
    ).toEqual([...standIds].sort((a, b) => a - b));
  });

  it("has no active hold once the viewer's hold has expired", async () => {
    const { festival, owner, standIds } = await seed();
    asUser(owner);

    const held = await createStandHold({
      standId: standIds[0],
      idempotencyKey: randomUUID(),
    });
    expect(held.success).toBe(true);
    await integrationDb!
      .update(standHolds)
      .set({
        createdAt: new Date(Date.now() - 120_000),
        expiresAt: new Date(Date.now() - 60_000),
      })
      .where(eq(standHolds.festivalId, festival.id));

    const dto = await fetchFestivalReservationMapDto({
      festivalId: festival.id,
      profileId: owner.id,
      revealHiddenIdentities: false,
    });

    expect(dto?.activeHold).toBeNull();
  });

  it("marks only the declared full table's stands as full-table halves", async () => {
    const { festival, owner, group, standIds, loneStandId } = await seed({
      loneStand: true,
    });

    const dto = await fetchFestivalReservationMapDto({
      festivalId: festival.id,
      profileId: owner.id,
      revealHiddenIdentities: false,
    });

    const byId = new Map(mapStands(dto).map((stand) => [stand.id, stand]));
    expect(byId.size).toBe(3);
    for (const standId of standIds) {
      expect(byId.get(standId)).toMatchObject({
        standGroupId: group.id,
        isFullTableHalf: true,
      });
    }
    expect(byId.get(loneStandId!)).toMatchObject({
      standGroupId: null,
      isFullTableHalf: false,
    });
  });

  it("reports full-table access only once it is active", async () => {
    const { festival, owner } = await seed();
    asUser(owner);

    const before = await fetchFestivalReservationMapDto({
      festivalId: festival.id,
      profileId: owner.id,
      revealHiddenIdentities: false,
    });
    expect(before?.fullTableAccessActive).toBe(false);

    await activate(festival.id);

    const after = await fetchFestivalReservationMapDto({
      festivalId: festival.id,
      profileId: owner.id,
      revealHiddenIdentities: false,
    });
    expect(after?.fullTableAccessActive).toBe(true);
  });

  it("quotes the activation fee from an offer passed as a value", async () => {
    const { festival, owner } = await seed();

    const dto = await fetchFestivalReservationMapDto({
      festivalId: festival.id,
      profileId: owner.id,
      revealHiddenIdentities: false,
      activationOffer: activationOffer(),
    });

    expect(dto?.fullTableActivationPrice).toBe(OFFER_PRICE);
  });

  it("quotes the activation fee from an offer passed as a promise", async () => {
    const { festival, owner } = await seed();

    const dto = await fetchFestivalReservationMapDto({
      festivalId: festival.id,
      profileId: owner.id,
      revealHiddenIdentities: false,
      activationOffer: Promise.resolve(activationOffer()),
    });

    expect(dto?.fullTableActivationPrice).toBe(OFFER_PRICE);
  });

  it("quotes no activation fee without an offer", async () => {
    const { festival, owner } = await seed();

    for (const offer of [null, Promise.resolve(null), undefined]) {
      const dto = await fetchFestivalReservationMapDto({
        festivalId: festival.id,
        profileId: owner.id,
        revealHiddenIdentities: false,
        activationOffer: offer,
      });
      expect(dto?.fullTableActivationPrice).toBeNull();
    }
  });

  it("quotes no activation fee to somebody who would have to top up", async () => {
    const { festival, owner } = await seed();

    const dto = await fetchFestivalReservationMapDto({
      festivalId: festival.id,
      profileId: owner.id,
      revealHiddenIdentities: false,
      activationOffer: activationOffer({
        shortfall: 10,
        blockedReason: "insufficient_credits",
      }),
    });

    expect(dto?.fullTableActivationPrice).toBeNull();
  });

  it("quotes no activation fee once access is already active", async () => {
    const { festival, owner } = await seed();
    asUser(owner);
    await activate(festival.id);

    // A stale offer that still claims activation is possible: the access row
    // wins over it.
    const dto = await fetchFestivalReservationMapDto({
      festivalId: festival.id,
      profileId: owner.id,
      revealHiddenIdentities: false,
      activationOffer: activationOffer(),
    });

    expect(dto?.fullTableAccessActive).toBe(true);
    expect(dto?.fullTableActivationPrice).toBeNull();
  });

  it("returns an empty map when the profile has no stand category", async () => {
    const { festival, owner } = await seed();
    standMatchOverride.forceNull = true;

    const dto = await fetchFestivalReservationMapDto({
      festivalId: festival.id,
      profileId: owner.id,
      revealHiddenIdentities: false,
      activationOffer: activationOffer(),
    });

    expect(dto).not.toBeNull();
    expect(dto).toMatchObject({
      festival: { id: festival.id },
      profile: { id: owner.id },
      alreadyReserved: false,
      subcategoryIds: [],
      sectors: [],
      activeHold: null,
      fullTableAccessActive: false,
      fullTableActivationPrice: null,
    });
  });

  it("shows no stands to a profile in the `none` category", async () => {
    const { festival, owner } = await seed({ category: "none" });

    const dto = await fetchFestivalReservationMapDto({
      festivalId: festival.id,
      profileId: owner.id,
      revealHiddenIdentities: false,
      activationOffer: activationOffer(),
    });

    expect(dto?.sectors).toEqual([]);
    expect(dto?.fullTableActivationPrice).toBeNull();
  });
});
