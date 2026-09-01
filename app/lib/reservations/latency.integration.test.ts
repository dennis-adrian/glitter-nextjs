// @vitest-environment node

import { eq } from "drizzle-orm";
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

import { collectForbiddenDtoKeys } from "@/app/lib/reservations/dto";
import * as schema from "@/db/schema";
import {
  festivalSectors,
  festivals,
  mapElements,
  reservationParticipants,
  standHolds,
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
  ? new Pool({ connectionString: testDatabaseUrl })
  : null;
const integrationDb = pool ? drizzle(pool, { schema }) : null;
const describeDatabase = integrationDb ? describe : describe.skip;

const MAP_BUDGET_MS = 1_500;
const CONFIRMATION_BUDGET_MS = 1_000;
const STATUS_BUDGET_MS = 200;
const SEARCH_BUDGET_MS = 300;
const MAP_QUERY_BUDGET = 16;

type Fixture = {
  festivalId: number;
  sectorIds: number[];
  standIds: number[];
  elementIds: number[];
  holdIds: number[];
  reservationIds: number[];
  requestIds: number[];
  userIds: number[];
};

const fixtures: Fixture[] = [];

let fetchFestivalReservationMapDto: (typeof import("@/app/lib/reservations/map-queries"))["fetchFestivalReservationMapDto"];
let fetchFestivalReservationConfirmationDto: (typeof import("@/app/lib/reservations/map-queries"))["fetchFestivalReservationConfirmationDto"];
let loadSectorStandStatusRows: (typeof import("@/app/lib/stands/status-service"))["loadSectorStandStatusRows"];
let searchPotentialPartnersForActor: (typeof import("@/app/lib/reservations/partner-search"))["searchPotentialPartnersForActor"];

function percentile(values: number[], p: number) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[index] ?? 0;
}

async function timeMs(fn: () => Promise<unknown>) {
  const started = performance.now();
  await fn();
  return performance.now() - started;
}

function captureQueries() {
  const queries: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((arg: unknown) => {
    if (arg && typeof arg === "object" && arg !== null && "query" in arg) {
      queries.push(String((arg as { query: unknown }).query));
    }
  });
  return {
    queries,
    restore() {
      spy.mockRestore();
    },
  };
}

describeDatabase("reservation Phase 4 latency budgets", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl!;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";

    ({
      fetchFestivalReservationMapDto,
      fetchFestivalReservationConfirmationDto,
    } = await import("@/app/lib/reservations/map-queries"));
    ({ loadSectorStandStatusRows } = await import(
      "@/app/lib/stands/status-service"
    ));
    ({ searchPotentialPartnersForActor } = await import(
      "@/app/lib/reservations/partner-search"
    ));
  }, 60_000);

  afterEach(async () => {
    currentProfileMock.mockReset();
    const db = integrationDb!;
    const leftover = fixtures.splice(0);
    for (const fixture of leftover) {
      if (fixture.holdIds.length > 0) {
        await db
          .delete(standHolds)
          .where(eq(standHolds.festivalId, fixture.festivalId));
      }
      for (const reservationId of fixture.reservationIds) {
        await db
          .delete(reservationParticipants)
          .where(eq(reservationParticipants.reservationId, reservationId));
        await db
          .delete(standReservations)
          .where(eq(standReservations.id, reservationId));
      }
      for (const elementId of fixture.elementIds) {
        await db.delete(mapElements).where(eq(mapElements.id, elementId));
      }
      for (const standId of fixture.standIds) {
        await db.delete(stands).where(eq(stands.id, standId));
      }
      for (const sectorId of fixture.sectorIds) {
        await db.delete(festivalSectors).where(eq(festivalSectors.id, sectorId));
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

  async function seedMapFestival(options: {
    sectorCount: number;
    standsPerSector: number;
  }) {
    const db = integrationDb!;
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const [festival] = await db
      .insert(festivals)
      .values({
        name: `Latency Map ${suffix}`,
        status: "active",
        festivalType: "glitter",
        participantTermsEnabled: true,
        reservationsStartDate: new Date(Date.now() - 60_000),
      })
      .returning();

    const [actor] = await db
      .insert(users)
      .values({
        clerkId: `latency-actor-${suffix}`,
        email: `latency-actor-${suffix}@example.test`,
        displayName: `QvrmActor ${suffix}`,
        status: "verified",
        category: "illustration",
        participationType: "standard",
      })
      .returning();
    const [partner] = await db
      .insert(users)
      .values({
        clerkId: `latency-partner-${suffix}`,
        email: `latency-partner-${suffix}@example.test`,
        displayName: `QvrmPartner ${suffix}`,
        status: "verified",
        category: "illustration",
        participationType: "standard",
      })
      .returning();

    const enrollmentRows = await db
      .insert(userRequests)
      .values([
        {
          userId: actor.id,
          festivalId: festival.id,
          type: "festival_participation",
          status: "accepted",
        },
        {
          userId: partner.id,
          festivalId: festival.id,
          type: "festival_participation",
          status: "accepted",
        },
      ])
      .returning();

    const sectorRows = await db
      .insert(festivalSectors)
      .values(
        Array.from({ length: options.sectorCount }, (_, index) => ({
          name: `Sector ${index + 1}`,
          festivalId: festival.id,
          orderInFestival: index + 1,
          mapOriginX: 0,
          mapOriginY: 0,
          mapWidth: 80,
          mapHeight: 60,
        })),
      )
      .returning();

    const elementRows = await db
      .insert(mapElements)
      .values(
        sectorRows.map((sector, index) => ({
          festivalSectorId: sector.id,
          type: "entrance" as const,
          label: `E${index + 1}`,
          labelPosition: "bottom" as const,
          positionLeft: 2,
          positionTop: 2,
          width: 8,
          height: 4,
        })),
      )
      .returning();

    const standValues = sectorRows.flatMap((sector, sectorIndex) =>
      Array.from({ length: options.standsPerSector }, (_, standIndex) => ({
        festivalId: festival.id,
        festivalSectorId: sector.id,
        standNumber: sectorIndex * options.standsPerSector + standIndex + 1,
        label: "A",
        standCategory: "illustration" as const,
        participationType: "standard" as const,
        status:
          standIndex === 0 ? ("reserved" as const) : ("available" as const),
        positionLeft: 6 + standIndex * 6,
        positionTop: 8,
        width: 6,
        height: 6,
        price: 350,
      })),
    );
    const standRows = await db.insert(stands).values(standValues).returning();

    const reservedStands = standRows.filter(
      (stand) => stand.status === "reserved",
    );
    const reservationRows = await db
      .insert(standReservations)
      .values(
        reservedStands.map((stand) => ({
          standId: stand.id,
          festivalId: festival.id,
          status: "accepted" as const,
          source: "admin_assignment" as const,
          ownerUserId: partner.id,
          revealAt: new Date(Date.now() + 86_400_000),
        })),
      )
      .returning();
    await db.insert(reservationParticipants).values(
      reservationRows.map((reservation) => ({
        reservationId: reservation.id,
        userId: partner.id,
      })),
    );

    const availableStand = standRows.find((stand) => stand.status === "available");
    const holdExpiresAt = new Date(Date.now() + 5 * 60_000);
    const holdRows = availableStand
      ? await db
          .insert(standHolds)
          .values({
            standId: availableStand.id,
            userId: actor.id,
            festivalId: festival.id,
            expiresAt: holdExpiresAt,
          })
          .returning()
      : [];

    fixtures.push({
      festivalId: festival.id,
      sectorIds: sectorRows.map((row) => row.id),
      standIds: standRows.map((row) => row.id),
      elementIds: elementRows.map((row) => row.id),
      holdIds: holdRows.map((row) => row.id),
      reservationIds: reservationRows.map((row) => row.id),
      requestIds: enrollmentRows.map((row) => row.id),
      userIds: [actor.id, partner.id],
    });

    currentProfileMock.mockResolvedValue({
      id: actor.id,
      role: "user",
      status: "verified",
    });

    return {
      festival,
      actor,
      partner,
      sectors: sectorRows,
      stands: standRows,
      hold: holdRows[0] ?? null,
    };
  }

  it("keeps map/confirmation/status/search under Phase 4 budgets without N+1 or PII", async () => {
    const small = await seedMapFestival({ sectorCount: 2, standsPerSector: 12 });
    const smallCapture = captureQueries();
    const smallMap = await fetchFestivalReservationMapDto({
      festivalId: small.festival.id,
      profileId: small.actor.id,
      revealHiddenIdentities: false,
    });
    smallCapture.restore();
    expect(smallMap).not.toBeNull();
    expect(collectForbiddenDtoKeys(smallMap)).toEqual([]);
    const smallQueryCount = smallCapture.queries.length;

    const large = await seedMapFestival({ sectorCount: 3, standsPerSector: 30 });
    await fetchFestivalReservationMapDto({
      festivalId: large.festival.id,
      profileId: large.actor.id,
      revealHiddenIdentities: false,
    });

    const mapSamples: number[] = [];
    const confirmSamples: number[] = [];
    const statusSamples: number[] = [];
    const searchSamples: number[] = [];
    let mapDto = smallMap;
    let confirmation = null;
    let statusRows = { stands: [], activeHoldStandIds: new Set<number>() };

    const largeCapture = captureQueries();
    mapDto = await fetchFestivalReservationMapDto({
      festivalId: large.festival.id,
      profileId: large.actor.id,
      revealHiddenIdentities: false,
    });
    const largeQueryCount = largeCapture.queries.length;
    largeCapture.restore();

    for (let i = 0; i < 5; i += 1) {
      mapSamples.push(
        await timeMs(() =>
          fetchFestivalReservationMapDto({
            festivalId: large.festival.id,
            profileId: large.actor.id,
            revealHiddenIdentities: false,
          }),
        ),
      );
      confirmSamples.push(
        await timeMs(async () => {
          confirmation = await fetchFestivalReservationConfirmationDto({
            festivalId: large.festival.id,
            profileId: large.actor.id,
            holdId: large.hold!.id,
          });
        }),
      );
      statusSamples.push(
        await timeMs(async () => {
          statusRows = await loadSectorStandStatusRows(
            large.sectors[0]!.id,
            new Date(),
          );
        }),
      );
      searchSamples.push(
        await timeMs(() =>
          searchPotentialPartnersForActor(
            large.festival.id,
            large.partner.displayName!.slice(0, 8),
          ),
        ),
      );
    }

    expect(mapDto).not.toBeNull();
    expect(collectForbiddenDtoKeys(mapDto)).toEqual([]);
    expect(mapDto!.sectors.length).toBe(3);
    expect(
      mapDto!.sectors.reduce((sum, sector) => sum + sector.stands.length, 0),
    ).toBe(90);
    const hiddenStand = mapDto!.sectors
      .flatMap((sector) => sector.stands)
      .find((stand) => stand.effectiveStatus === "reserved");
    expect(hiddenStand?.visibleParticipantSummaries).toEqual([]);

    expect(confirmation).not.toBeNull();
    expect(collectForbiddenDtoKeys(confirmation)).toEqual([]);
    expect(statusRows.stands.length).toBe(30);

    expect(smallQueryCount).toBeGreaterThan(0);
    expect(largeQueryCount).toBe(smallQueryCount);
    expect(largeQueryCount).toBeLessThanOrEqual(MAP_QUERY_BUDGET);

    const mapP75 = percentile(mapSamples, 75);
    const confirmP75 = percentile(confirmSamples, 75);
    const statusP75 = percentile(statusSamples, 75);
    const searchP75 = percentile(searchSamples, 75);

    console.info("reservation-latency", {
      mapQueryCount: largeQueryCount,
      mapP75,
      confirmP75,
      statusP75,
      searchP75,
      mapSamples,
      confirmSamples,
      statusSamples,
      searchSamples,
    });

    expect(mapP75).toBeLessThanOrEqual(MAP_BUDGET_MS);
    expect(confirmP75).toBeLessThanOrEqual(CONFIRMATION_BUDGET_MS);
    expect(statusP75).toBeLessThanOrEqual(STATUS_BUDGET_MS);
    expect(searchP75).toBeLessThanOrEqual(SEARCH_BUDGET_MS);
  }, 60_000);
});
