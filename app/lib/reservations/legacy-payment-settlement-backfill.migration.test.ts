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
  join(process.cwd(), "drizzle/0254_legacy_payment_settlement_backfill.sql"),
  "utf8",
);

const client = canUseTestDatabase
  ? new Client({ connectionString: testDatabaseUrl })
  : null;
const describeDatabase = client ? describe : describe.skip;

describe("legacy payment settlement backfill SQL", () => {
  it("creates approved and submitted records without changing aggregate status", () => {
    expect(migration).toContain('SELECT DISTINCT ON (p."invoice_id")');
    expect(migration).toContain(
      "WHEN p.\"invoice_status\" = 'paid' THEN 'approved'::\"settlement_submission_status\"",
    );
    expect(migration).toContain(
      'ON CONFLICT ("invoice_id", "idempotency_key")',
    );
    expect(migration).toContain("DO NOTHING");
  });
});

describeDatabase("legacy payment settlement backfill", () => {
  beforeAll(async () => {
    await client!.connect();
  });

  afterAll(async () => {
    await client!.end();
  });

  it("backfills one deterministic record per paid or reviewing invoice", async () => {
    const suffix = `legacy-settlement-${Date.now()}`;
    await client!.query("BEGIN");
    try {
      const festival = await client!.query<{ id: number }>(
        `INSERT INTO "festivals" ("name") VALUES ($1) RETURNING id`,
        [`Legacy settlement ${suffix}`],
      );
      const user = await client!.query<{ id: number }>(
        `INSERT INTO "users" ("clerk_id", "email")
         VALUES ($1, $2) RETURNING id`,
        [`clerk-${suffix}`, `${suffix}@example.test`],
      );
      const stands = await client!.query<{ id: number }>(
        `INSERT INTO "stands" ("festival_id", "stand_number")
         VALUES ($1, 1), ($1, 2) RETURNING id`,
        [festival.rows[0].id],
      );
      const reservations = await client!.query<{ id: number }>(
        `INSERT INTO "stand_reservations" ("stand_id", "festival_id", "status")
         VALUES ($1, $3, 'accepted'), ($2, $3, 'verification_payment')
         RETURNING id`,
        [stands.rows[0].id, stands.rows[1].id, festival.rows[0].id],
      );
      const invoices = await client!.query<{ id: number }>(
        `INSERT INTO "invoices"
           ("original_amount", "discount_amount", "amount", "date", "status", "user_id", "reservation_id")
         VALUES
           (100, 0, 100, now(), 'paid', $1, $2),
           (100, 0, 100, now(), 'verification_payment', $1, $3)
         RETURNING id`,
        [user.rows[0].id, reservations.rows[0].id, reservations.rows[1].id],
      );
      const payments = await client!.query<{ id: number }>(
        `INSERT INTO "payments" ("amount", "date", "invoice_id", "voucher_url")
         VALUES
           (100, now() - interval '1 hour', $1, $3),
           (100, now(), $1, $4),
           (100, now(), $2, $5)
         RETURNING id`,
        [
          invoices.rows[0].id,
          invoices.rows[1].id,
          `https://example.test/${suffix}-old`,
          `https://example.test/${suffix}-new`,
          `https://example.test/${suffix}-review`,
        ],
      );

      await client!.query(migration);
      await client!.query(migration);

      const submissions = await client!.query<{
        invoice_id: number;
        payment_id: number;
        status: string;
      }>(
        `SELECT "invoice_id", "payment_id", "status"
         FROM "invoice_settlement_submissions"
         WHERE invoice_id = ANY($1)
         ORDER BY invoice_id`,
        [invoices.rows.map((invoice) => invoice.id)],
      );
      expect(submissions.rows).toEqual([
        {
          invoice_id: invoices.rows[0].id,
          payment_id: payments.rows[1].id,
          status: "approved",
        },
        {
          invoice_id: invoices.rows[1].id,
          payment_id: payments.rows[2].id,
          status: "submitted",
        },
      ]);

      const aggregates = await client!.query<{
        invoice_status: string;
        reservation_status: string;
      }>(
        `SELECT i.status AS invoice_status, r.status AS reservation_status
         FROM "invoices" AS i
         INNER JOIN "stand_reservations" AS r ON r.id = i.reservation_id
         WHERE i.id = ANY($1)
         ORDER BY i.id`,
        [invoices.rows.map((invoice) => invoice.id)],
      );
      expect(aggregates.rows).toEqual([
        { invoice_status: "paid", reservation_status: "accepted" },
        {
          invoice_status: "verification_payment",
          reservation_status: "verification_payment",
        },
      ]);
    } finally {
      await client!.query("ROLLBACK").catch(() => undefined);
    }
  });
});
