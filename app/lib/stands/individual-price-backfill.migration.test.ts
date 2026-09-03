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

const backfillMigration = readFileSync(
  join(process.cwd(), "drizzle/0263_stand_individual_price_backfill.sql"),
  "utf8",
);

describe("stand individual price backfill SQL", () => {
  it("only fills rows still sitting at the column default", () => {
    const normalized = backfillMigration.replace(/\s+/g, " ");
    expect(normalized).toContain(
      `UPDATE "stands" SET "individual_price" = "price" WHERE "individual_price" = 0 AND "price" <> 0;`,
    );
  });

  it("skips databases that never received the Phase 2 columns", () => {
    expect(backfillMigration).toContain("information_schema.columns");
    expect(backfillMigration).toContain("column_name = 'individual_price'");
    expect(backfillMigration).toContain("column_name = 'price'");
  });
});

const client = canUseTestDatabase
  ? new Client({ connectionString: testDatabaseUrl })
  : null;
const describeDatabase = client ? describe : describe.skip;

describeDatabase("stand individual price backfill", () => {
  beforeAll(async () => {
    await client!.connect();
  });

  afterAll(async () => {
    await client!.end();
  });

  async function seedStands(suffix: string) {
    const festival = await client!.query<{ id: number }>(
      `INSERT INTO "festivals" ("name") VALUES ($1) RETURNING id`,
      [`Price Backfill ${suffix}`],
    );
    const festivalId = festival.rows[0].id;

    // Row 1 predates 0261: real price, individual_price still at the default.
    // Row 2 is genuinely free. Row 3 was already repriced through the Phase 2
    // editor and must not be clobbered by the stale adapter value.
    const stands = await client!.query<{ id: number }>(
      `INSERT INTO "stands"
         ("festival_id", "stand_number", "price", "individual_price")
       VALUES ($1, 1, 250.00, 0), ($1, 2, 0, 0), ($1, 3, 250.00, 310.00)
       RETURNING id`,
      [festivalId],
    );
    return stands.rows.map((row) => row.id);
  }

  async function readPrices(standIds: number[]) {
    const result = await client!.query<{
      id: number;
      price: string;
      individual_price: string;
    }>(
      `SELECT id, price, individual_price FROM "stands" WHERE id = ANY($1::int[]) ORDER BY id`,
      [standIds],
    );
    return result.rows.map((row) => ({
      price: Number(row.price),
      individualPrice: Number(row.individual_price),
    }));
  }

  it("copies the legacy price onto rows left at the default", async () => {
    const suffix = `copy-${Date.now()}`;
    await client!.query("BEGIN");
    try {
      const standIds = await seedStands(suffix);
      await client!.query(backfillMigration);

      const [legacy, free, edited] = await readPrices(standIds);
      expect(legacy.individualPrice).toBe(250);
      expect(free.individualPrice).toBe(0);
      expect(edited.individualPrice).toBe(310);
    } finally {
      await client!.query("ROLLBACK").catch(() => undefined);
    }
  });

  it("is a no-op on a second run", async () => {
    const suffix = `idempotent-${Date.now()}`;
    await client!.query("BEGIN");
    try {
      const standIds = await seedStands(suffix);
      await client!.query(backfillMigration);
      const afterFirst = await readPrices(standIds);
      await client!.query(backfillMigration);
      const afterSecond = await readPrices(standIds);

      expect(afterSecond).toEqual(afterFirst);
    } finally {
      await client!.query("ROLLBACK").catch(() => undefined);
    }
  });
});
