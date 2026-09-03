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
import * as schema from "@/db/schema";
import {
  festivalTermsDocuments,
  festivalTermsVersions,
  festivals,
  invoices,
  reservationParticipants,
  reservationRequestRegistry,
  scheduledTasks,
  standHolds,
  standReservationEvents,
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
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
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

type Fixture = {
  festivalId: number;
  standIds: number[];
  userIds: number[];
  requestIds: number[];
  requestKeys: string[];
};

const fixtures: Fixture[] = [];
let createStandHold: (typeof import("@/app/lib/reservations/hold-service"))["createStandHold"];
let confirmStandHold: (typeof import("@/app/lib/reservations/hold-service"))["confirmStandHold"];
let publishedTermsVersionId: number;

/**
 * The reservation flow must price from `stands.individual_price` /
 * `stands.shared_price` — the columns the Phase 2 editor writes — and must
 * snapshot both onto the hold and the reservation (PRD §6.1). These run against
 * real Postgres because the bug they guard against is a column-level mismatch
 * that any mock of the stand row would paper over.
 */
describeDatabase("reservation price snapshots", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl!;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";

    ({ createStandHold, confirmStandHold } =
      await import("@/app/lib/reservations/hold-service"));

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
    const leftover = fixtures.splice(0);
    for (const fixture of leftover) {
      if (fixture.requestKeys.length > 0) {
        await db
          .delete(reservationRequestRegistry)
          .where(
            inArray(reservationRequestRegistry.requestKey, fixture.requestKeys),
          );
      }
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
          .delete(standReservations)
          .where(inArray(standReservations.id, reservationIds));
      }
      await db
        .delete(standHolds)
        .where(eq(standHolds.festivalId, fixture.festivalId));
      for (const standId of fixture.standIds) {
        await db.delete(stands).where(eq(stands.id, standId));
      }
      for (const requestId of fixture.requestIds) {
        await db.delete(userRequests).where(eq(userRequests.id, requestId));
      }
      for (const userId of fixture.userIds) {
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

  async function seedFixture(input: {
    userCount: number;
    /** Legacy adapter value, deliberately stale to prove it is not read. */
    price: number;
    individualPrice: number;
    sharedPrice?: number | null;
  }) {
    const db = integrationDb!;
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const requestKeys: string[] = [];

    const [festival] = await db
      .insert(festivals)
      .values({
        name: `Pricing ${suffix}`,
        status: "active",
        festivalType: "glitter",
        participantTermsEnabled: true,
        reservationsStartDate: new Date(Date.now() - 60_000),
      })
      .returning();

    const insertedUsers = await db
      .insert(users)
      .values(
        Array.from({ length: input.userCount }, (_, index) => ({
          clerkId: `pricing-${suffix}-${index}`,
          email: `pricing-${suffix}-${index}@example.test`,
          displayName: `Pricing ${suffix}-${index}`,
          status: "verified" as const,
          category: "illustration" as const,
        })),
      )
      .returning();

    const enrollmentRows = await db
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

    const [stand] = await db
      .insert(stands)
      .values({
        festivalId: festival.id,
        standNumber: 1,
        standCategory: "illustration" as const,
        status: "available" as const,
        price: input.price,
        individualPrice: input.individualPrice,
        sharedPrice: input.sharedPrice ?? null,
      })
      .returning();

    fixtures.push({
      festivalId: festival.id,
      standIds: [stand.id],
      userIds: insertedUsers.map((user) => user.id),
      requestIds: enrollmentRows.map((row) => row.id),
      requestKeys,
    });

    return {
      festival,
      users: insertedUsers,
      stand,
      trackRequestKey(key: string) {
        requestKeys.push(key);
      },
    };
  }

  async function holdFor(
    actor: { id: number },
    standId: number,
    trackRequestKey: (key: string) => void,
  ) {
    const key = randomUUID();
    trackRequestKey(key);
    currentProfileMock.mockResolvedValue({
      id: actor.id,
      role: "user",
      status: "verified",
    });
    const result = await createStandHold({ standId, idempotencyKey: key });
    expect(result.success).toBe(true);
    const [hold] = await integrationDb!
      .select()
      .from(standHolds)
      .where(eq(standHolds.standId, standId));
    expect(hold).toBeTruthy();
    return hold;
  }

  async function confirmFor(
    actor: { id: number },
    holdId: number,
    trackRequestKey: (key: string) => void,
    partnerId?: number,
  ) {
    const key = randomUUID();
    trackRequestKey(key);
    currentProfileMock.mockResolvedValue({
      id: actor.id,
      role: "user",
      status: "verified",
    });
    return confirmStandHold({ holdId, partnerId, idempotencyKey: key });
  }

  async function readReservationAndInvoice(festivalId: number) {
    const [reservation] = await integrationDb!
      .select()
      .from(standReservations)
      .where(eq(standReservations.festivalId, festivalId));
    expect(reservation).toBeTruthy();
    const [invoice] = await integrationDb!
      .select()
      .from(invoices)
      .where(eq(invoices.reservationId, reservation.id));
    return { reservation, invoice };
  }

  it("snapshots both illustration prices onto the hold, ignoring the legacy column", async () => {
    const {
      users: [owner],
      stand,
      trackRequestKey,
    } = await seedFixture({
      userCount: 1,
      price: 999,
      individualPrice: 250,
      sharedPrice: 400,
    });

    const hold = await holdFor(owner, stand.id, trackRequestKey);

    expect(hold.individualPriceSnapshot).toBe(250);
    expect(hold.sharedPriceSnapshot).toBe(400);
    expect(hold.priceAmountSnapshot).toBe(250);
  });

  it("bills a solo booking at the individual price", async () => {
    const {
      festival,
      users: [owner],
      stand,
      trackRequestKey,
    } = await seedFixture({
      userCount: 1,
      price: 999,
      individualPrice: 250,
      sharedPrice: 400,
    });

    const hold = await holdFor(owner, stand.id, trackRequestKey);
    const result = await confirmFor(owner, hold.id, trackRequestKey);
    expect(result.success).toBe(true);

    const { reservation, invoice } = await readReservationAndInvoice(
      festival.id,
    );
    expect(reservation.bookedParticipantCount).toBe(1);
    expect(reservation.priceAmountSnapshot).toBe(250);
    expect(reservation.individualPriceSnapshot).toBe(250);
    // Retained even though it was not billed, so a later partner addition can
    // price off the stand as it stood at booking time.
    expect(reservation.sharedPriceSnapshot).toBe(400);
    expect(invoice.amount).toBe(250);
  });

  it("bills a booking made with a partner at the shared price", async () => {
    const {
      festival,
      users: [owner, partner],
      stand,
      trackRequestKey,
    } = await seedFixture({
      userCount: 2,
      price: 999,
      individualPrice: 250,
      sharedPrice: 400,
    });

    const hold = await holdFor(owner, stand.id, trackRequestKey);
    const result = await confirmFor(
      owner,
      hold.id,
      trackRequestKey,
      partner.id,
    );
    expect(result.success).toBe(true);

    const { reservation, invoice } = await readReservationAndInvoice(
      festival.id,
    );
    expect(reservation.bookedParticipantCount).toBe(2);
    expect(reservation.priceAmountSnapshot).toBe(400);
    expect(reservation.individualPriceSnapshot).toBe(250);
    expect(reservation.sharedPriceSnapshot).toBe(400);
    expect(invoice.amount).toBe(400);
  });

  it("falls back to the individual price when no shared price is configured", async () => {
    const {
      festival,
      users: [owner, partner],
      stand,
      trackRequestKey,
    } = await seedFixture({
      userCount: 2,
      price: 999,
      individualPrice: 250,
      sharedPrice: null,
    });

    const hold = await holdFor(owner, stand.id, trackRequestKey);
    const result = await confirmFor(
      owner,
      hold.id,
      trackRequestKey,
      partner.id,
    );
    expect(result.success).toBe(true);

    const { reservation, invoice } = await readReservationAndInvoice(
      festival.id,
    );
    expect(reservation.bookedParticipantCount).toBe(2);
    expect(reservation.sharedPriceSnapshot).toBeNull();
    expect(reservation.priceAmountSnapshot).toBe(250);
    expect(invoice.amount).toBe(250);
  });
});
