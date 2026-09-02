// @vitest-environment node

import { randomUUID } from "crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { RESERVATION_REQUEST_OPERATIONS } from "@/app/lib/reservations/request-registry";

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
  ? new Pool({ connectionString: testDatabaseUrl, max: 4 })
  : null;
const describeDatabase = pool ? describe : describe.skip;

let client: PoolClient;
let festivalId: number;

async function insertFeature(values: {
  type: string;
  category?: string | null;
  creditPrice?: number;
  deadlineOverrideAt?: string | null;
}) {
  return client.query(
    `INSERT INTO festival_reservation_features
       (festival_id, type, category, credit_price, deadline_override_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      festivalId,
      values.type,
      values.category ?? null,
      values.creditPrice ?? 10,
      values.deadlineOverrideAt ?? null,
    ],
  );
}

/** Each case runs inside a savepoint so one rejection cannot poison the next. */
async function expectRejected(run: () => Promise<unknown>, constraint: string) {
  await client.query("SAVEPOINT constraint_case");
  await expect(run()).rejects.toThrow(constraint);
  await client.query("ROLLBACK TO SAVEPOINT constraint_case");
}

/** Rolls back too, so an accepted row cannot collide with a later case. */
async function expectAccepted(run: () => Promise<unknown>) {
  await client.query("SAVEPOINT constraint_case");
  await run();
  await client.query("ROLLBACK TO SAVEPOINT constraint_case");
}

describeDatabase("festival reservation feature constraints", () => {
  beforeAll(async () => {
    client = await pool!.connect();
    await client.query("BEGIN");
    const probe = await client.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema='public' AND table_name='festival_reservation_features'`,
    );
    if (probe.rows.length === 0) {
      throw new Error(
        "TEST_DATABASE_URL is safe but unmigrated; apply Drizzle migrations first.",
      );
    }
    const festival = await client.query(
      `INSERT INTO festivals (name) VALUES ($1) RETURNING id`,
      [`feature-config-${randomUUID()}`],
    );
    festivalId = festival.rows[0].id;
  }, 60_000);

  afterAll(async () => {
    await client?.query("ROLLBACK");
    client?.release();
  });

  it("refuses a full-table row without a category", async () => {
    // Regression: `category IN (...)` is NULL for a null category and a CHECK
    // passes on NULL, so the first version of this constraint accepted it.
    await expectRejected(
      () => insertFeature({ type: "full_table", category: null }),
      "festival_reservation_features_category_by_type",
    );
  });

  it("refuses a full-table row for an ineligible category", async () => {
    await expectRejected(
      () => insertFeature({ type: "full_table", category: "gastronomy" }),
      "festival_reservation_features_category_by_type",
    );
    await expectRejected(
      () => insertFeature({ type: "full_table", category: "none" }),
      "festival_reservation_features_category_by_type",
    );
  });

  it("accepts full table for illustration and entrepreneurship", async () => {
    await expectAccepted(() =>
      insertFeature({ type: "full_table", category: "illustration" }),
    );
    await expectAccepted(() =>
      insertFeature({ type: "full_table", category: "entrepreneurship" }),
    );
  });

  it("refuses a category on a festival-wide feature type", async () => {
    for (const type of ["late_partner", "reservation_release"]) {
      await expectRejected(
        () => insertFeature({ type, category: "illustration" }),
        "festival_reservation_features_category_by_type",
      );
    }
  });

  it("allows a deadline override only for late partner", async () => {
    const deadline = new Date().toISOString();
    await expectAccepted(() =>
      insertFeature({ type: "late_partner", deadlineOverrideAt: deadline }),
    );
    await expectRejected(
      () =>
        insertFeature({
          type: "reservation_release",
          deadlineOverrideAt: deadline,
        }),
      "festival_reservation_features_deadline_by_type",
    );
  });

  it("refuses a negative credit price", async () => {
    await expectRejected(
      () => insertFeature({ type: "reservation_release", creditPrice: -1 }),
      "festival_reservation_features_credit_price_nonnegative",
    );
  });

  it("keeps one row per scope", async () => {
    await client.query("SAVEPOINT dup_scoped");
    await insertFeature({ type: "full_table", category: "illustration" });
    await expect(
      insertFeature({ type: "full_table", category: "illustration" }),
    ).rejects.toThrow("festival_reservation_features_scoped_unique");
    await client.query("ROLLBACK TO SAVEPOINT dup_scoped");
  });

  it("treats a null category as equal for festival-wide types", async () => {
    // Postgres treats nulls as distinct, so a single three-column unique index
    // would allow unlimited festival-wide rows. The partial pair prevents it.
    await client.query("SAVEPOINT dup_wide");
    await insertFeature({ type: "reservation_release" });
    await expect(insertFeature({ type: "reservation_release" })).rejects.toThrow(
      "festival_reservation_features_festival_wide_unique",
    );
    await client.query("ROLLBACK TO SAVEPOINT dup_wide");
  });
});

describeDatabase("illustration stand pricing constraints", () => {
  let standClient: PoolClient;
  let sectorId: number;

  beforeAll(async () => {
    standClient = await pool!.connect();
    await standClient.query("BEGIN");
    const festival = await standClient.query(
      `INSERT INTO festivals (name) VALUES ($1) RETURNING id`,
      [`stand-pricing-${randomUUID()}`],
    );
    const sector = await standClient.query(
      `INSERT INTO festival_sectors (festival_id, name) VALUES ($1, $2) RETURNING id`,
      [festival.rows[0].id, "pricing"],
    );
    sectorId = sector.rows[0].id;
  }, 60_000);

  afterAll(async () => {
    await standClient?.query("ROLLBACK");
    standClient?.release();
  });

  async function insertStand(individualPrice: number, sharedPrice: number | null) {
    return standClient.query(
      `INSERT INTO stands (stand_number, festival_sector_id, individual_price, shared_price)
       VALUES ($1, $2, $3, $4)`,
      [Math.floor(Math.random() * 1_000_000), sectorId, individualPrice, sharedPrice],
    );
  }

  it("refuses a shared price below the individual price", async () => {
    await standClient.query("SAVEPOINT stand_case");
    await expect(insertStand(200, 150)).rejects.toThrow(
      "stands_shared_price_not_below_individual",
    );
    await standClient.query("ROLLBACK TO SAVEPOINT stand_case");
  });

  it("refuses a negative individual price", async () => {
    await standClient.query("SAVEPOINT stand_case");
    await expect(insertStand(-1, null)).rejects.toThrow(
      "stands_individual_price_nonnegative",
    );
    await standClient.query("ROLLBACK TO SAVEPOINT stand_case");
  });

  it("accepts an equal or higher shared price, and a null one", async () => {
    await insertStand(200, 200);
    await insertStand(200, 260);
    await insertStand(200, null);
  });
});

describeDatabase("reservation request registry operations", () => {
  let registryClient: PoolClient;
  let actorUserId: number;

  beforeAll(async () => {
    registryClient = await pool!.connect();
    await registryClient.query("BEGIN");
    const user = await registryClient.query(
      `INSERT INTO users (clerk_id, email) VALUES ($1, $2) RETURNING id`,
      [`registry-${randomUUID()}`, `registry-${randomUUID()}@example.com`],
    );
    actorUserId = user.rows[0].id;
  }, 60_000);

  // Last block in the file owns the shared pool.
  afterAll(async () => {
    await registryClient?.query("ROLLBACK");
    registryClient?.release();
    await pool?.end();
  });

  /**
   * The allowed-operation list lives in two places: the TypeScript union and a
   * database CHECK. They drifted once already — `applyInvoiceCredits` and
   * `createInvoiceCreditTopUp` were added to the union but not the constraint,
   * so every credit claim threw and surfaced as a permanent CONFLICT_RETRY.
   * Unit tests mock the registry, so only this can catch it.
   */
  it("accepts every operation the application declares", async () => {
    for (const operation of RESERVATION_REQUEST_OPERATIONS) {
      await registryClient.query("SAVEPOINT registry_case");
      await expect(
        registryClient.query(
          `INSERT INTO reservation_request_registry
             (request_key, operation, actor_user_id, scope)
           VALUES ($1, $2, $3, $4)`,
          [`${operation}-${randomUUID()}`, operation, actorUserId, {}],
        ),
      ).resolves.toBeDefined();
      await registryClient.query("ROLLBACK TO SAVEPOINT registry_case");
    }
  });

  it("still rejects an operation the application does not declare", async () => {
    await registryClient.query("SAVEPOINT registry_case");
    await expect(
      registryClient.query(
        `INSERT INTO reservation_request_registry
           (request_key, operation, actor_user_id, scope)
         VALUES ($1, $2, $3, $4)`,
        [randomUUID(), "dropAllTables", actorUserId, {}],
      ),
    ).rejects.toThrow("reservation_request_registry_operation_check");
    await registryClient.query("ROLLBACK TO SAVEPOINT registry_case");
  });
});
