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

const schemaMigration = readFileSync(
  join(process.cwd(), "drizzle/0251_reservation_extension_schema.sql"),
  "utf8",
);
const reassignmentMigration = readFileSync(
  join(process.cwd(), "drizzle/0252_member_cardinality_reassignment.sql"),
  "utf8",
);
const priceSnapshotBackfillMigration = readFileSync(
  join(process.cwd(), "drizzle/0253_reservation_price_snapshot_backfill.sql"),
  "utf8",
);

const reservationPriceBackfill = `UPDATE "stand_reservations"
SET "individual_price_snapshot" = "price_amount_snapshot"
WHERE "individual_price_snapshot" IS NULL;`;

function functionSql(source: string, name: string) {
  const header = `CREATE OR REPLACE FUNCTION "${name}"`;
  const start = source.indexOf(header);
  if (start < 0) {
    throw new Error(`${name} was not found`);
  }
  const end = source.indexOf("$$;", start);
  if (end < 0) {
    throw new Error(`${name} body was not terminated`);
  }
  return source.slice(start, end + 3);
}

const holdFn = functionSql(
  schemaMigration,
  "enforce_stand_hold_member_cardinality",
);
const reservationFn = functionSql(
  schemaMigration,
  "enforce_stand_reservation_member_cardinality",
);

describe("stand member cardinality trigger SQL", () => {
  it("backfills reservation prices before counting participations", () => {
    expect(schemaMigration).toContain(reservationPriceBackfill);
    expect(priceSnapshotBackfillMigration).toContain(reservationPriceBackfill);
    expect(schemaMigration.indexOf(reservationPriceBackfill)).toBeLessThan(
      schemaMigration.indexOf('UPDATE "stand_reservations" AS sr'),
    );
  });

  it("checks both parents when a hold member is reassigned", () => {
    expect(holdFn).toContain("IF TG_OP = 'DELETE' THEN");
    expect(holdFn).toContain("target_hold_ids := ARRAY[OLD.hold_id];");
    expect(holdFn).toContain(
      "ELSIF TG_OP = 'UPDATE' AND OLD.hold_id IS DISTINCT FROM NEW.hold_id THEN",
    );
    expect(holdFn).toContain(
      "target_hold_ids := ARRAY[OLD.hold_id, NEW.hold_id];",
    );
    expect(holdFn).toContain("target_hold_ids := ARRAY[NEW.hold_id];");
    expect(holdFn).not.toContain(
      "target_hold_id integer := CASE WHEN TG_OP = 'DELETE' THEN OLD.hold_id ELSE NEW.hold_id END",
    );
  });

  it("checks both parents when a reservation member is reassigned", () => {
    expect(reservationFn).toContain("IF TG_OP = 'DELETE' THEN");
    expect(reservationFn).toContain(
      "target_reservation_ids := ARRAY[OLD.reservation_id];",
    );
    expect(reservationFn).toContain(
      "ELSIF TG_OP = 'UPDATE' AND OLD.reservation_id IS DISTINCT FROM NEW.reservation_id THEN",
    );
    expect(reservationFn).toContain(
      "target_reservation_ids := ARRAY[OLD.reservation_id, NEW.reservation_id];",
    );
    expect(reservationFn).toContain(
      "target_reservation_ids := ARRAY[NEW.reservation_id];",
    );
  });

  it("replaces both cardinality functions for already-applied 0251 databases", () => {
    expect(
      functionSql(
        reassignmentMigration,
        "enforce_stand_hold_member_cardinality",
      ),
    ).toBe(holdFn);
    expect(
      functionSql(
        reassignmentMigration,
        "enforce_stand_reservation_member_cardinality",
      ),
    ).toBe(reservationFn);
  });
});

const client = canUseTestDatabase
  ? new Client({ connectionString: testDatabaseUrl })
  : null;
const describeDatabase = client ? describe : describe.skip;

describeDatabase("stand member cardinality reassignment", () => {
  beforeAll(async () => {
    await client!.connect();
  });

  afterAll(async () => {
    await client!.end();
  });

  async function rollbackIfNeeded() {
    await client!.query("ROLLBACK").catch(() => undefined);
  }

  it("rejects moving a hold member off its former parent", async () => {
    const suffix = `hold-card-${Date.now()}`;
    await client!.query("BEGIN");
    try {
      const festival = await client!.query<{ id: number }>(
        `INSERT INTO "festivals" ("name") VALUES ($1) RETURNING id`,
        [`Cardinality Hold ${suffix}`],
      );
      const festivalId = festival.rows[0].id;
      const users = await client!.query<{ id: number }>(
        `INSERT INTO "users" ("clerk_id", "email")
         VALUES ($1, $2), ($3, $4)
         RETURNING id`,
        [
          `clerk-${suffix}-a`,
          `${suffix}-a@example.test`,
          `clerk-${suffix}-b`,
          `${suffix}-b@example.test`,
        ],
      );
      const stands = await client!.query<{ id: number }>(
        `INSERT INTO "stands" ("festival_id", "stand_number")
         VALUES ($1, 1), ($1, 2)
         RETURNING id`,
        [festivalId],
      );
      const holds = await client!.query<{ id: number }>(
        `INSERT INTO "stand_holds"
           ("stand_id", "user_id", "festival_id", "expires_at")
         VALUES
           ($1, $3, $5, now() + interval '1 hour'),
           ($2, $4, $5, now() + interval '1 hour')
         RETURNING id`,
        [
          stands.rows[0].id,
          stands.rows[1].id,
          users.rows[0].id,
          users.rows[1].id,
          festivalId,
        ],
      );

      await client!.query(
        `DELETE FROM "stand_hold_members" WHERE hold_id = $1`,
        [holds.rows[1].id],
      );
      await client!.query(
        `UPDATE "stand_hold_members" SET hold_id = $1 WHERE hold_id = $2`,
        [holds.rows[1].id, holds.rows[0].id],
      );

      await expect(client!.query("COMMIT")).rejects.toThrow(
        /stand hold \d+ must have exactly one member during Phase 0B/,
      );
    } finally {
      await rollbackIfNeeded();
    }
  });

  it("rejects moving a reservation member off its former parent", async () => {
    const suffix = `res-card-${Date.now()}`;
    await client!.query("BEGIN");
    try {
      const festival = await client!.query<{ id: number }>(
        `INSERT INTO "festivals" ("name") VALUES ($1) RETURNING id`,
        [`Cardinality Reservation ${suffix}`],
      );
      const festivalId = festival.rows[0].id;
      const stands = await client!.query<{ id: number }>(
        `INSERT INTO "stands" ("festival_id", "stand_number")
         VALUES ($1, 1), ($1, 2)
         RETURNING id`,
        [festivalId],
      );
      const reservations = await client!.query<{ id: number }>(
        `INSERT INTO "stand_reservations" ("stand_id", "festival_id", "status")
         VALUES ($1, $3, 'pending'), ($2, $3, 'pending')
         RETURNING id`,
        [stands.rows[0].id, stands.rows[1].id, festivalId],
      );

      await client!.query(
        `DELETE FROM "stand_reservation_members" WHERE reservation_id = $1`,
        [reservations.rows[1].id],
      );
      await client!.query(
        `UPDATE "stand_reservation_members"
         SET reservation_id = $1
         WHERE reservation_id = $2`,
        [reservations.rows[1].id, reservations.rows[0].id],
      );

      await expect(client!.query("COMMIT")).rejects.toThrow(
        /stand reservation \d+ must have exactly one member during Phase 0B/,
      );
    } finally {
      await rollbackIfNeeded();
    }
  });

  it("still allows deleting a hold with its cascaded member", async () => {
    const suffix = `hold-del-${Date.now()}`;
    let festivalId: number | undefined;
    let userId: number | undefined;
    await client!.query("BEGIN");
    try {
      const festival = await client!.query<{ id: number }>(
        `INSERT INTO "festivals" ("name") VALUES ($1) RETURNING id`,
        [`Cardinality Delete ${suffix}`],
      );
      festivalId = festival.rows[0].id;
      const users = await client!.query<{ id: number }>(
        `INSERT INTO "users" ("clerk_id", "email")
         VALUES ($1, $2)
         RETURNING id`,
        [`clerk-${suffix}`, `${suffix}@example.test`],
      );
      userId = users.rows[0].id;
      const stands = await client!.query<{ id: number }>(
        `INSERT INTO "stands" ("festival_id", "stand_number")
         VALUES ($1, 1)
         RETURNING id`,
        [festivalId],
      );
      const holds = await client!.query<{ id: number }>(
        `INSERT INTO "stand_holds"
           ("stand_id", "user_id", "festival_id", "expires_at")
         VALUES ($1, $2, $3, now() + interval '1 hour')
         RETURNING id`,
        [stands.rows[0].id, userId, festivalId],
      );

      await client!.query(`DELETE FROM "stand_holds" WHERE id = $1`, [
        holds.rows[0].id,
      ]);
      await client!.query("COMMIT");
    } finally {
      await rollbackIfNeeded();
      if (festivalId) {
        await client!.query(`DELETE FROM "stands" WHERE festival_id = $1`, [
          festivalId,
        ]);
        await client!.query(`DELETE FROM "festivals" WHERE id = $1`, [
          festivalId,
        ]);
      }
      if (userId) {
        await client!.query(`DELETE FROM "users" WHERE id = $1`, [userId]);
      }
    }
  });

  it("backfills a reservation price without participation rows", async () => {
    const suffix = `reservation-price-${Date.now()}`;
    await client!.query("BEGIN");
    try {
      const festival = await client!.query<{ id: number }>(
        `INSERT INTO "festivals" ("name") VALUES ($1) RETURNING id`,
        [`Reservation Price ${suffix}`],
      );
      const festivalId = festival.rows[0].id;
      const stand = await client!.query<{ id: number }>(
        `INSERT INTO "stands" ("festival_id", "stand_number")
         VALUES ($1, 1) RETURNING id`,
        [festivalId],
      );
      const reservation = await client!.query<{ id: number }>(
        `INSERT INTO "stand_reservations"
           ("stand_id", "festival_id", "status", "price_amount_snapshot", "individual_price_snapshot")
         VALUES ($1, $2, 'pending', 42.50, NULL)
         RETURNING id`,
        [stand.rows[0].id, festivalId],
      );

      await client!.query(priceSnapshotBackfillMigration);

      const snapshots = await client!.query<{
        individual_price_snapshot: string | null;
      }>(
        `SELECT "individual_price_snapshot"
         FROM "stand_reservations"
         WHERE id = $1`,
        [reservation.rows[0].id],
      );
      expect(snapshots.rows[0].individual_price_snapshot).toBe("42.50");
    } finally {
      await rollbackIfNeeded();
    }
  });
});
