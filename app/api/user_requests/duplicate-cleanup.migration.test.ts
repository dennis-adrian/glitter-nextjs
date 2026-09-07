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

const migration = readFileSync(
  join(process.cwd(), "drizzle/0240_calm_expediter.sql"),
  "utf8",
);
const cleanup = migration
  .split("--> statement-breakpoint")
  .map((statement) => statement.trim())
  .find((statement) => statement.startsWith('DELETE FROM "user_requests"'));

if (!cleanup) {
  throw new Error("user_requests duplicate cleanup was not found");
}

describe("user_requests duplicate cleanup migration", () => {
  it("ranks status ahead of recency so accepted rows survive", () => {
    const orderBy = cleanup.slice(
      cleanup.indexOf("ORDER BY"),
      cleanup.indexOf(") AS rn"),
    );

    expect(orderBy.indexOf("CASE status")).toBeGreaterThan(-1);
    expect(orderBy.indexOf("CASE status")).toBeLessThan(
      orderBy.indexOf("updated_at DESC"),
    );
    expect(orderBy.indexOf("WHEN 'accepted' THEN 0")).toBeGreaterThan(-1);
    expect(orderBy.indexOf("WHEN 'pending' THEN 1")).toBeGreaterThan(-1);
    expect(orderBy.indexOf("updated_at DESC")).toBeLessThan(
      orderBy.indexOf("created_at DESC"),
    );
    expect(cleanup).toContain("PARTITION BY user_id, festival_id, type");
  });
});

const client = canUseTestDatabase
  ? new Client({ connectionString: testDatabaseUrl })
  : null;
const describeDatabase = client ? describe : describe.skip;

describeDatabase("user_requests duplicate cleanup ranking", () => {
  beforeAll(async () => {
    await client!.connect();
  });

  afterAll(async () => {
    await client!.end();
  });

  it("keeps the accepted participation request over a newer pending duplicate", async () => {
    await client!.query("BEGIN");
    try {
      await client!.query(`
        CREATE TEMP TABLE "user_requests" (
          "id" integer PRIMARY KEY,
          "user_id" integer NOT NULL,
          "festival_id" integer,
          "type" text NOT NULL,
          "status" text NOT NULL,
          "updated_at" timestamp NOT NULL,
          "created_at" timestamp NOT NULL
        ) ON COMMIT DROP
      `);
      await client!.query(`
        INSERT INTO "user_requests"
          ("id", "user_id", "festival_id", "type", "status", "updated_at", "created_at")
        VALUES
          (1, 10, 20, 'festival_participation', 'accepted', '2024-01-01', '2024-01-01'),
          (2, 10, 20, 'festival_participation', 'pending', '2024-06-01', '2024-06-01')
      `);

      await client!.query(cleanup);

      const result = await client!.query<{ id: number; status: string }>(
        `SELECT id, status FROM "user_requests" ORDER BY id`,
      );

      expect(result.rows).toEqual([{ id: 1, status: "accepted" }]);
    } finally {
      await client!.query("ROLLBACK");
    }
  });
});
