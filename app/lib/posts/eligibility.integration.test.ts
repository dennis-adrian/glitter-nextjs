// @vitest-environment node

import { inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";
import {
  festivals,
  reservationParticipants,
  standReservations,
  stands,
  users,
} from "@/db/schema";

vi.mock("server-only", () => ({}));

const dbMock = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock("@/db", () => ({ db: dbMock }));

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

let canAuthorPosts: (typeof import("@/app/lib/posts/eligibility"))["canAuthorPosts"];

const createdUserIds: number[] = [];
const createdFestivalIds: number[] = [];
const createdStandIds: number[] = [];
const createdReservationIds: number[] = [];

type ReservationStatus = "pending" | "accepted" | "rejected" | "cancelled";

/** A participant row per (festival, status) pair, so a history is one array. */
async function seedParticipant(
  history: { festivalId: number; status: ReservationStatus }[],
): Promise<{ id: number; role: string }> {
  const db = integrationDb!;
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const [user] = await db
    .insert(users)
    .values({
      clerkId: `blog-eligibility-${suffix}`,
      email: `blog-eligibility-${suffix}@example.test`,
    })
    .returning({ id: users.id });
  createdUserIds.push(user.id);

  for (const [index, entry] of history.entries()) {
    const [stand] = await db
      .insert(stands)
      .values({ standNumber: 9000 + index, festivalId: entry.festivalId })
      .returning({ id: stands.id });
    createdStandIds.push(stand.id);

    const [reservation] = await db
      .insert(standReservations)
      .values({
        standId: stand.id,
        festivalId: entry.festivalId,
        status: entry.status,
      })
      .returning({ id: standReservations.id });
    createdReservationIds.push(reservation.id);

    await db
      .insert(reservationParticipants)
      .values({ userId: user.id, reservationId: reservation.id });
  }

  // A fresh object each time: `canAuthorPosts` is wrapped in React `cache`,
  // which keys on argument identity, so reusing one would memoise a verdict
  // across cases.
  return { id: user.id, role: "artist" };
}

describeDatabase("canAuthorPosts", () => {
  let festivalIds: number[] = [];

  beforeAll(async () => {
    process.env.POSTGRES_URL ??= testDatabaseUrl;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";

    // `eligibility.ts` only ever calls `db.select(...)`, so pointing that one
    // method at the real client is the whole seam.
    Object.assign(dbMock, {
      select: integrationDb!.select.bind(integrationDb),
    });

    ({ canAuthorPosts } = await import("@/app/lib/posts/eligibility"));

    const probe = await pool!.query<{ posts: string | null }>(
      "select to_regclass('public.posts')::text as posts",
    );
    if (!probe.rows[0]?.posts) {
      throw new Error(
        "TEST_DATABASE_URL is safe but unmigrated; apply Drizzle migrations first.",
      );
    }

    const rows = await integrationDb!
      .insert(festivals)
      .values([
        { name: "Blog Eligibility A" },
        { name: "Blog Eligibility B" },
        { name: "Blog Eligibility C" },
        { name: "Blog Eligibility D" },
      ])
      .returning({ id: festivals.id });
    festivalIds = rows.map((row) => row.id);
    createdFestivalIds.push(...festivalIds);
  }, 60_000);

  afterAll(async () => {
    const db = integrationDb;
    if (db) {
      if (createdReservationIds.length > 0) {
        await db
          .delete(standReservations)
          .where(inArray(standReservations.id, createdReservationIds));
      }
      if (createdStandIds.length > 0) {
        await db.delete(stands).where(inArray(stands.id, createdStandIds));
      }
      if (createdUserIds.length > 0) {
        await db.delete(users).where(inArray(users.id, createdUserIds));
      }
      if (createdFestivalIds.length > 0) {
        await db
          .delete(festivals)
          .where(inArray(festivals.id, createdFestivalIds));
      }
    }
    await pool?.end();
  });

  it("admits both admin tiers without looking at any history", async () => {
    await expect(
      canAuthorPosts({ id: -1, role: "admin" } as never),
    ).resolves.toBe(true);
    await expect(
      canAuthorPosts({ id: -2, role: "festival_admin" } as never),
    ).resolves.toBe(true);
  });

  it("refuses a missing profile", async () => {
    await expect(canAuthorPosts(null)).resolves.toBe(false);
    await expect(canAuthorPosts(undefined)).resolves.toBe(false);
  });

  it("refuses a participant with no history at all", async () => {
    const profile = await seedParticipant([]);
    await expect(canAuthorPosts(profile as never)).resolves.toBe(false);
  });

  it("refuses at two accepted festivals and admits at three", async () => {
    const two = await seedParticipant([
      { festivalId: festivalIds[0], status: "accepted" },
      { festivalId: festivalIds[1], status: "accepted" },
    ]);
    await expect(canAuthorPosts(two as never)).resolves.toBe(false);

    const three = await seedParticipant([
      { festivalId: festivalIds[0], status: "accepted" },
      { festivalId: festivalIds[1], status: "accepted" },
      { festivalId: festivalIds[2], status: "accepted" },
    ]);
    await expect(canAuthorPosts(three as never)).resolves.toBe(true);
  });

  /** The rule is three *distinct festivals*, not three reservations. */
  it("refuses three accepted reservations that span only two festivals", async () => {
    const profile = await seedParticipant([
      { festivalId: festivalIds[0], status: "accepted" },
      { festivalId: festivalIds[0], status: "accepted" },
      { festivalId: festivalIds[1], status: "accepted" },
    ]);

    await expect(canAuthorPosts(profile as never)).resolves.toBe(false);
  });

  it("counts only accepted reservations", async () => {
    const unconfirmed = await seedParticipant([
      { festivalId: festivalIds[0], status: "pending" },
      { festivalId: festivalIds[1], status: "rejected" },
      { festivalId: festivalIds[2], status: "cancelled" },
    ]);
    await expect(canAuthorPosts(unconfirmed as never)).resolves.toBe(false);

    const mixed = await seedParticipant([
      { festivalId: festivalIds[0], status: "accepted" },
      { festivalId: festivalIds[1], status: "accepted" },
      { festivalId: festivalIds[2], status: "pending" },
    ]);
    await expect(canAuthorPosts(mixed as never)).resolves.toBe(false);
  });

  it("admits once a fourth festival makes up the shortfall", async () => {
    const profile = await seedParticipant([
      { festivalId: festivalIds[0], status: "accepted" },
      { festivalId: festivalIds[1], status: "accepted" },
      { festivalId: festivalIds[2], status: "pending" },
      { festivalId: festivalIds[3], status: "accepted" },
    ]);

    await expect(canAuthorPosts(profile as never)).resolves.toBe(true);
  });

  it("does not let another participant's history count", async () => {
    await seedParticipant([
      { festivalId: festivalIds[0], status: "accepted" },
      { festivalId: festivalIds[1], status: "accepted" },
      { festivalId: festivalIds[2], status: "accepted" },
    ]);
    const bystander = await seedParticipant([]);

    await expect(canAuthorPosts(bystander as never)).resolves.toBe(false);
  });
});
