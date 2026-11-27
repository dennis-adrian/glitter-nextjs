// @vitest-environment node

import { inArray } from "drizzle-orm";
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
  reservationParticipants,
  standReservationStands,
  standReservations,
  stands,
  users,
} from "@/db/schema";
import { isSafeTestDatabase } from "@/test-utils/safe-test-database";

const viewer = vi.hoisted(() => ({
  current: null as null | { id: number; role: string; status: string },
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/vendors/resend", () => ({ sendEmail: vi.fn() }));
vi.mock("@/app/lib/users/helpers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/lib/users/helpers")>()),
  getCurrentUserProfile: async () => viewer.current,
  getCurrentBaseProfile: async () => viewer.current,
  requireAdminOrFestivalAdmin: async () => viewer.current,
}));

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (testDatabaseUrl && !isSafeTestDatabase(testDatabaseUrl)) {
  throw new Error(
    "TEST_DATABASE_URL must target a database whose name contains 'test' or 'ci'.",
  );
}

const pool = testDatabaseUrl
  ? new Pool({ connectionString: testDatabaseUrl, max: 3 })
  : null;
const integrationDb = pool ? drizzle(pool, { schema }) : null;
const describeDatabase = integrationDb ? describe : describe.skip;

const created = { festivalIds: [] as number[], userIds: [] as number[] };

let participants: typeof import("@/app/lib/participants/actions");
let history: typeof import("@/app/lib/participations/admin-history-queries");
let grouping: typeof import("@/app/lib/participations/admin-history");

describeDatabase("participations counted by festival", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl!;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";
    participants = await import("@/app/lib/participants/actions");
    history = await import("@/app/lib/participations/admin-history-queries");
    grouping = await import("@/app/lib/participations/admin-history");
  }, 60_000);

  afterEach(async () => {
    const db = integrationDb!;
    if (created.festivalIds.length > 0) {
      const reservationIds = (
        await db
          .select({ id: standReservations.id })
          .from(standReservations)
          .where(inArray(standReservations.festivalId, created.festivalIds))
      ).map((row) => row.id);
      if (reservationIds.length > 0) {
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
        .delete(stands)
        .where(inArray(stands.festivalId, created.festivalIds));
      await db
        .delete(festivalSectors)
        .where(inArray(festivalSectors.festivalId, created.festivalIds));
      await db
        .delete(festivals)
        .where(inArray(festivals.id, created.festivalIds));
    }
    if (created.userIds.length > 0) {
      await db.delete(users).where(inArray(users.id, created.userIds));
    }
    created.festivalIds = [];
    created.userIds = [];
    viewer.current = null;
  });

  afterAll(async () => {
    await pool?.end();
  });

  /**
   * One participant with two accepted stands in the same edition (two
   * reservations, the only way to hold two before full tables), one accepted
   * stand in another, and a rejected attempt in a third.
   */
  async function seed() {
    const db = integrationDb!;
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const [admin, participant] = await db
      .insert(users)
      .values([
        {
          clerkId: `count-admin-${suffix}`,
          email: `count-admin-${suffix}@example.test`,
          status: "verified" as const,
          role: "admin" as const,
        },
        {
          clerkId: `count-user-${suffix}`,
          email: `count-user-${suffix}@example.test`,
          displayName: `Count ${suffix}`,
          status: "verified" as const,
          category: "illustration" as const,
        },
      ])
      .returning();
    created.userIds.push(admin.id, participant.id);
    viewer.current = { id: admin.id, role: "admin", status: "verified" };

    const festivalRows = await db
      .insert(festivals)
      .values(
        ["Doble", "Simple", "Rechazada"].map((name) => ({
          name: `${name} ${suffix}`,
          status: "archived" as const,
          festivalType: "glitter" as const,
          reservationsStartDate: new Date(Date.now() - 60_000),
        })),
      )
      .returning();
    created.festivalIds.push(...festivalRows.map((festival) => festival.id));

    const plan: [number, "accepted" | "rejected"][] = [
      [0, "accepted"],
      [0, "accepted"],
      [1, "accepted"],
      [2, "rejected"],
    ];
    for (const [index, [festivalIndex, status]] of plan.entries()) {
      const festival = festivalRows[festivalIndex];
      const [sector] = await db
        .insert(festivalSectors)
        .values({
          name: `S${index} ${suffix}`,
          festivalId: festival.id,
          orderInFestival: index + 1,
        })
        .returning();
      const [stand] = await db
        .insert(stands)
        .values({
          festivalId: festival.id,
          festivalSectorId: sector.id,
          standNumber: index + 1,
          standCategory: "illustration",
          status: "available",
          price: 100,
          individualPrice: 100,
        })
        .returning();
      const [reservation] = await db
        .insert(standReservations)
        .values({
          festivalId: festival.id,
          standId: stand.id,
          status,
          source: "user_reservation",
          ownerUserId: participant.id,
        })
        .returning();
      await db.insert(standReservationStands).values({
        reservationId: reservation.id,
        standId: stand.id,
        position: 0,
      });
      await db.insert(reservationParticipants).values({
        userId: participant.id,
        reservationId: reservation.id,
      });
    }
    return { participant };
  }

  it("counts festivals with an accepted reservation, not reservations, in the table and the profile", async () => {
    const { participant } = await seed();

    const summary = await participants.fetchParticipantActivitySummary(
      participant.id,
    );
    expect(summary?.acceptedParticipationsCount).toBe(2);

    const [row] = await participants.fetchParticipantProfiles({
      limit: 10,
      offset: 0,
      query: participant.email,
      sort: "updatedAt",
      direction: "desc",
      profileCompletion: "all",
    });
    expect(row?.id).toBe(participant.id);
    expect(row?.activitySummary.acceptedParticipationsCount).toBe(2);
  });

  it("lists the history as one entry per festival, with both stands of the double edition inside", async () => {
    const { participant } = await seed();

    const rows = await history.fetchAdminParticipationHistory(participant.id);
    expect(rows).toHaveLength(4);
    const groups = grouping.groupParticipationHistoryByFestival(rows);
    expect(groups).toHaveLength(3);
    const double = groups.find((group) =>
      group.festival.name.startsWith("Doble"),
    );
    expect(double?.reservations).toHaveLength(2);
  });
});
