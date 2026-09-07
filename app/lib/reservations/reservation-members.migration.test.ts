import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const testDatabaseName = testDatabaseUrl
  ? decodeURIComponent(new URL(testDatabaseUrl).pathname.slice(1))
  : "";
const canUseTestDatabase =
  !!testDatabaseUrl && /(^|[_-])(test|ci)([_-]|$)/i.test(testDatabaseName);

if (testDatabaseUrl && !canUseTestDatabase) {
  throw new Error(
    "TEST_DATABASE_URL must target a database whose name contains 'test' or 'ci'.",
  );
}

const migration = readFileSync(
  join(process.cwd(), "drizzle/0264_stand_reservation_stands.sql"),
  "utf8",
);

describe("stand reservation member migration SQL", () => {
  it("validates the backfill instead of trusting it", () => {
    expect(migration).toContain("backfill copied % of % adapter rows");
    expect(migration).toContain("backfill lost % membership rows");
    expect(migration).toContain("backfill left % rows with a stale status");
  });

  it("retires the Phase 0B adapter machinery", () => {
    for (const name of [
      "stand_holds_sync_single_member",
      "stand_hold_members_exactly_one",
      "stand_reservations_sync_single_member",
      "stand_reservation_members_exactly_one",
    ]) {
      expect(migration).toContain(`DROP TRIGGER IF EXISTS "${name}"`);
    }
    expect(migration).toContain('DROP TABLE "stand_reservation_members"');
  });

  it("keeps the parent capacity protection in place", () => {
    // PRD §11: the parent index stays until member protection is verified in
    // production, so this migration must not drop it.
    expect(migration).not.toContain(
      'DROP INDEX "stand_reservations_capacity_stand_unique"',
    );
    expect(migration).not.toContain(
      'ALTER TABLE "stand_reservations" DROP COLUMN',
    );
  });
});

const client = canUseTestDatabase
  ? new Client({ connectionString: testDatabaseUrl })
  : null;
const describeDatabase = client ? describe : describe.skip;

describeDatabase("stand reservation member invariants", () => {
  beforeAll(async () => {
    await client!.connect();
  });

  afterAll(async () => {
    await client!.end();
  });

  async function rollback() {
    await client!.query("ROLLBACK").catch(() => undefined);
  }

  async function seed(suffix: string, standCount = 2) {
    const festival = await client!.query<{ id: number }>(
      `INSERT INTO "festivals" ("name") VALUES ($1) RETURNING id`,
      [`Members ${suffix}`],
    );
    const festivalId = festival.rows[0].id;
    const stands = await client!.query<{ id: number }>(
      `INSERT INTO "stands" ("festival_id", "stand_number")
       SELECT $1, generate_series(1, $2) RETURNING id`,
      [festivalId, standCount],
    );
    return { festivalId, standIds: stands.rows.map((row) => row.id) };
  }

  async function createReservation(
    festivalId: number,
    standId: number,
    status = "pending",
  ) {
    const reservation = await client!.query<{ id: number }>(
      `INSERT INTO "stand_reservations" ("stand_id", "festival_id", "status")
       VALUES ($1, $2, $3) RETURNING id`,
      [standId, festivalId, status],
    );
    return reservation.rows[0].id;
  }

  it("accepts a two-stand reservation aggregate", async () => {
    const suffix = `pair-${Date.now()}`;
    await client!.query("BEGIN");
    try {
      const { festivalId, standIds } = await seed(suffix);
      const reservationId = await createReservation(festivalId, standIds[0]);

      await client!.query(
        `INSERT INTO "stand_reservation_stands" ("reservation_id", "stand_id", "position")
         VALUES ($1, $2, 0), ($1, $3, 1)`,
        [reservationId, standIds[0], standIds[1]],
      );

      const members = await client!.query<{ n: string }>(
        `SELECT count(*) AS n FROM "stand_reservation_stands" WHERE reservation_id = $1`,
        [reservationId],
      );
      expect(Number(members.rows[0].n)).toBe(2);
    } finally {
      await rollback();
    }
  });

  it("fills the denormalised status from the parent on insert", async () => {
    const suffix = `status-${Date.now()}`;
    await client!.query("BEGIN");
    try {
      const { festivalId, standIds } = await seed(suffix, 1);
      const reservationId = await createReservation(
        festivalId,
        standIds[0],
        "accepted",
      );

      await client!.query(
        `INSERT INTO "stand_reservation_stands" ("reservation_id", "stand_id") VALUES ($1, $2)`,
        [reservationId, standIds[0]],
      );

      const row = await client!.query<{ reservation_status: string }>(
        `SELECT reservation_status FROM "stand_reservation_stands" WHERE reservation_id = $1`,
        [reservationId],
      );
      expect(row.rows[0].reservation_status).toBe("accepted");
    } finally {
      await rollback();
    }
  });

  it("propagates a parent status transition to its members", async () => {
    const suffix = `sync-${Date.now()}`;
    await client!.query("BEGIN");
    try {
      const { festivalId, standIds } = await seed(suffix, 1);
      const reservationId = await createReservation(festivalId, standIds[0]);
      await client!.query(
        `INSERT INTO "stand_reservation_stands" ("reservation_id", "stand_id") VALUES ($1, $2)`,
        [reservationId, standIds[0]],
      );

      await client!.query(
        `UPDATE "stand_reservations" SET "status" = 'cancelled' WHERE id = $1`,
        [reservationId],
      );

      const row = await client!.query<{ reservation_status: string }>(
        `SELECT reservation_status FROM "stand_reservation_stands" WHERE reservation_id = $1`,
        [reservationId],
      );
      expect(row.rows[0].reservation_status).toBe("cancelled");
    } finally {
      await rollback();
    }
  });

  it("refuses a second live member on the same stand", async () => {
    const suffix = `occupancy-${Date.now()}`;
    await client!.query("BEGIN");
    try {
      const { festivalId, standIds } = await seed(suffix);
      const first = await createReservation(festivalId, standIds[0]);
      // The parent capacity index still guards stand_id, so the competing
      // reservation parents onto a different stand and contests membership
      // only — which is exactly what the member-level index has to catch.
      const second = await client!.query<{ id: number }>(
        `INSERT INTO "stand_reservations" ("stand_id", "festival_id", "status")
         VALUES ($1, $2, 'cancelled') RETURNING id`,
        [standIds[1], festivalId],
      );

      await client!.query(
        `INSERT INTO "stand_reservation_stands" ("reservation_id", "stand_id") VALUES ($1, $2)`,
        [first, standIds[0]],
      );
      await client!.query(
        `INSERT INTO "stand_reservation_stands" ("reservation_id", "stand_id") VALUES ($1, $2)`,
        [second.rows[0].id, standIds[0]],
      );

      // The second member is not live yet, so it inserts. Promoting its parent
      // is what collides with the live member already on that stand.
      await expect(
        client!.query(
          `UPDATE "stand_reservations" SET "status" = 'accepted' WHERE id = $1`,
          [second.rows[0].id],
        ),
      ).rejects.toThrow(/stand_reservation_stands_active_stand_unique/);
    } finally {
      await rollback();
    }
  });

  it("frees the stand once the live member is released", async () => {
    const suffix = `release-${Date.now()}`;
    await client!.query("BEGIN");
    try {
      const { festivalId, standIds } = await seed(suffix);
      const first = await createReservation(festivalId, standIds[0]);
      await client!.query(
        `INSERT INTO "stand_reservation_stands" ("reservation_id", "stand_id") VALUES ($1, $2)`,
        [first, standIds[0]],
      );

      await client!.query(
        `UPDATE "stand_reservation_stands" SET "released_at" = now() WHERE reservation_id = $1`,
        [first],
      );

      const second = await client!.query<{ id: number }>(
        `INSERT INTO "stand_reservations" ("stand_id", "festival_id", "status")
         VALUES ($1, $2, 'cancelled') RETURNING id`,
        [standIds[1], festivalId],
      );
      await client!.query(
        `INSERT INTO "stand_reservation_stands" ("reservation_id", "stand_id") VALUES ($1, $2)`,
        [second.rows[0].id, standIds[0]],
      );
      await client!.query(
        `UPDATE "stand_reservations" SET "status" = 'accepted' WHERE id = $1`,
        [second.rows[0].id],
      );

      const live = await client!.query<{ n: string }>(
        `SELECT count(*) AS n FROM "stand_reservation_stands"
         WHERE stand_id = $1 AND released_at IS NULL
           AND reservation_status IN ('pending', 'verification_payment', 'accepted')`,
        [standIds[0]],
      );
      expect(Number(live.rows[0].n)).toBe(1);
    } finally {
      await rollback();
    }
  });

  it("lets one hold carry two stands", async () => {
    const suffix = `hold-${Date.now()}`;
    await client!.query("BEGIN");
    try {
      const { festivalId, standIds } = await seed(suffix);
      const user = await client!.query<{ id: number }>(
        `INSERT INTO "users" ("clerk_id", "email") VALUES ($1, $2) RETURNING id`,
        [`clerk-${suffix}`, `${suffix}@example.test`],
      );
      const hold = await client!.query<{ id: number }>(
        `INSERT INTO "stand_holds" ("stand_id", "user_id", "festival_id", "expires_at")
         VALUES ($1, $2, $3, now() + interval '1 hour') RETURNING id`,
        [standIds[0], user.rows[0].id, festivalId],
      );

      await client!.query(
        `INSERT INTO "stand_hold_members" ("hold_id", "stand_id", "position")
         VALUES ($1, $2, 0), ($1, $3, 1)`,
        [hold.rows[0].id, standIds[0], standIds[1]],
      );

      const members = await client!.query<{ n: string }>(
        `SELECT count(*) AS n FROM "stand_hold_members" WHERE hold_id = $1`,
        [hold.rows[0].id],
      );
      expect(Number(members.rows[0].n)).toBe(2);
    } finally {
      await rollback();
    }
  });

  it("still allows only one hold per stand", async () => {
    const suffix = `hold-dup-${Date.now()}`;
    await client!.query("BEGIN");
    try {
      const { festivalId, standIds } = await seed(suffix);
      const users = await client!.query<{ id: number }>(
        `INSERT INTO "users" ("clerk_id", "email")
         VALUES ($1, $2), ($3, $4) RETURNING id`,
        [
          `clerk-${suffix}-a`,
          `${suffix}-a@example.test`,
          `clerk-${suffix}-b`,
          `${suffix}-b@example.test`,
        ],
      );
      // Parented on different stands so the legacy parent index stays out of
      // the way; both then try to claim the same stand as a member.
      const holds = await client!.query<{ id: number }>(
        `INSERT INTO "stand_holds" ("stand_id", "user_id", "festival_id", "expires_at")
         VALUES ($1, $3, $5, now() + interval '1 hour'),
                ($2, $4, $5, now() + interval '1 hour')
         RETURNING id`,
        [
          standIds[0],
          standIds[1],
          users.rows[0].id,
          users.rows[1].id,
          festivalId,
        ],
      );

      await client!.query(
        `INSERT INTO "stand_hold_members" ("hold_id", "stand_id") VALUES ($1, $2)`,
        [holds.rows[0].id, standIds[0]],
      );

      await expect(
        client!.query(
          `INSERT INTO "stand_hold_members" ("hold_id", "stand_id") VALUES ($1, $2)`,
          [holds.rows[1].id, standIds[0]],
        ),
      ).rejects.toThrow(/stand_hold_members_stand_id_unique/);
    } finally {
      await rollback();
    }
  });
});
