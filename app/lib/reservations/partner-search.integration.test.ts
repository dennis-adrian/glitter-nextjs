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

import * as schema from "@/db/schema";
import {
  festivals,
  reservationParticipants,
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

let searchPotentialPartnersForActor: (typeof import("@/app/lib/reservations/partner-search"))["searchPotentialPartnersForActor"];

type Fixture = {
  festivalId: number;
  standIds: number[];
  reservationIds: number[];
  requestIds: number[];
  userIds: number[];
};

const fixtures: Fixture[] = [];

describeDatabase("searchPotentialPartnersForActor", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl!;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";

    ({ searchPotentialPartnersForActor } = await import(
      "@/app/lib/reservations/partner-search"
    ));

    const result = await pool!.query<{ reservations: string | null }>(
      "select to_regclass('public.stand_reservations')::text as reservations",
    );
    if (!result.rows[0]?.reservations) {
      throw new Error(
        "TEST_DATABASE_URL is safe but unmigrated; apply Drizzle migrations first.",
      );
    }
  }, 60_000);

  afterEach(async () => {
    currentProfileMock.mockReset();
    const db = integrationDb!;
    const leftover = fixtures.splice(0);
    for (const fixture of leftover) {
      for (const reservationId of fixture.reservationIds) {
        await db
          .delete(reservationParticipants)
          .where(eq(reservationParticipants.reservationId, reservationId));
        await db
          .delete(standReservations)
          .where(eq(standReservations.id, reservationId));
      }
      for (const standId of fixture.standIds) {
        await db.delete(stands).where(eq(stands.id, standId));
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

  it("shows partners with any festival reservation but does not make them selectable", async () => {
    const db = integrationDb!;
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const [festival] = await db
      .insert(festivals)
      .values({
        name: `Partner Search ${suffix}`,
        status: "active",
        festivalType: "glitter",
        participantTermsEnabled: true,
      })
      .returning();

    const [actor] = await db
      .insert(users)
      .values({
        clerkId: `partner-search-actor-${suffix}`,
        email: `partner-search-actor-${suffix}@example.test`,
        displayName: `Actor ${suffix}`,
        status: "verified",
        category: "illustration",
      })
      .returning();
    const [livePartner] = await db
      .insert(users)
      .values({
        clerkId: `partner-search-live-${suffix}`,
        email: `partner-search-live-${suffix}@example.test`,
        displayName: `QvrmLive ${suffix}`,
        status: "verified",
        category: "illustration",
      })
      .returning();
    const [rejectedPartner] = await db
      .insert(users)
      .values({
        clerkId: `partner-search-rejected-${suffix}`,
        email: `partner-search-rejected-${suffix}@example.test`,
        displayName: `QvrmRejected ${suffix}`,
        status: "verified",
        category: "illustration",
      })
      .returning();
    const [openPartner] = await db
      .insert(users)
      .values({
        clerkId: `partner-search-open-${suffix}`,
        email: `partner-search-open-${suffix}@example.test`,
        displayName: `QvrmOpen ${suffix}`,
        status: "verified",
        category: "illustration",
      })
      .returning();

    const enrollmentRows = await db
      .insert(userRequests)
      .values(
        [actor, livePartner, rejectedPartner, openPartner].map((user) => ({
          userId: user.id,
          festivalId: festival.id,
          type: "festival_participation" as const,
          status: "accepted" as const,
        })),
      )
      .returning();

    const [liveStand] = await db
      .insert(stands)
      .values({
        festivalId: festival.id,
        standNumber: 1,
        standCategory: "illustration",
        status: "reserved",
      })
      .returning();
    const [rejectedStand] = await db
      .insert(stands)
      .values({
        festivalId: festival.id,
        standNumber: 2,
        standCategory: "illustration",
        status: "available",
      })
      .returning();

    const [liveReservation] = await db
      .insert(standReservations)
      .values({
        standId: liveStand.id,
        festivalId: festival.id,
        status: "pending",
        source: "user_reservation",
        ownerUserId: livePartner.id,
      })
      .returning();
    const [rejectedReservation] = await db
      .insert(standReservations)
      .values({
        standId: rejectedStand.id,
        festivalId: festival.id,
        status: "rejected",
        source: "user_reservation",
        ownerUserId: rejectedPartner.id,
      })
      .returning();

    await db.insert(reservationParticipants).values([
      { userId: livePartner.id, reservationId: liveReservation.id },
      { userId: rejectedPartner.id, reservationId: rejectedReservation.id },
    ]);

    fixtures.push({
      festivalId: festival.id,
      standIds: [liveStand.id, rejectedStand.id],
      reservationIds: [liveReservation.id, rejectedReservation.id],
      requestIds: enrollmentRows.map((row) => row.id),
      userIds: [actor.id, livePartner.id, rejectedPartner.id, openPartner.id],
    });

    currentProfileMock.mockResolvedValue({ id: actor.id, role: "user" });

    const liveResults = await searchPotentialPartnersForActor(
      festival.id,
      livePartner.displayName!,
    );
    const rejectedResults = await searchPotentialPartnersForActor(
      festival.id,
      rejectedPartner.displayName!,
    );
    const openResults = await searchPotentialPartnersForActor(
      festival.id,
      openPartner.displayName!,
    );

    expect(liveResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: livePartner.id,
          selectable: false,
          denialCode: "PARTNER_ALREADY_RESERVED",
        }),
      ]),
    );
    expect(rejectedResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: rejectedPartner.id,
          selectable: false,
          denialCode: "PARTNER_ALREADY_RESERVED",
        }),
      ]),
    );
    expect(openResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: openPartner.id,
          selectable: true,
          denialCode: undefined,
        }),
      ]),
    );
  });
});
