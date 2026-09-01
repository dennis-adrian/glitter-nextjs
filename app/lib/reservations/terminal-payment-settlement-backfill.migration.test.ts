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
  join(
    process.cwd(),
    "drizzle/0255_terminal_reservation_payment_settlement_backfill.sql",
  ),
  "utf8",
);

const client = canUseTestDatabase
  ? new Client({ connectionString: testDatabaseUrl })
  : null;
const describeDatabase = client ? describe : describe.skip;

describe("terminal reservation payment settlement backfill SQL", () => {
  it("limits approved history to paid terminal reservations", () => {
    expect(migration).toContain("i.\"status\" = 'paid'");
    expect(migration).toContain(
      "r.\"status\" IN ('rejected', 'cancelled', 'released')",
    );
    expect(migration).toContain("'approved'::\"settlement_submission_status\"");
    expect(migration).toContain("s.\"kind\" = 'payment_proof'");
  });
});

describeDatabase("terminal reservation payment settlement backfill", () => {
  beforeAll(async () => {
    await client!.connect();
  });

  afterAll(async () => {
    await client!.end();
  });

  it("backfills terminal paid history and leaves active mismatches untouched", async () => {
    const suffix = `terminal-settlement-${Date.now()}`;
    await client!.query("BEGIN");
    try {
      const festival = await client!.query<{ id: number }>(
        `INSERT INTO "festivals" ("name") VALUES ($1) RETURNING id`,
        [`Terminal settlement ${suffix}`],
      );
      const user = await client!.query<{ id: number }>(
        `INSERT INTO "users" ("clerk_id", "email")
         VALUES ($1, $2) RETURNING id`,
        [`clerk-${suffix}`, `${suffix}@example.test`],
      );
      const stands = await client!.query<{ id: number }>(
        `INSERT INTO "stands" ("festival_id", "stand_number")
         VALUES ($1, 1), ($1, 2), ($1, 3), ($1, 4)
         RETURNING id`,
        [festival.rows[0].id],
      );
      const reservations = await client!.query<{
        id: number;
        status: string;
      }>(
        `INSERT INTO "stand_reservations" ("stand_id", "festival_id", "status")
         VALUES
           ($1, $5, 'rejected'),
           ($2, $5, 'cancelled'),
           ($3, $5, 'released'),
           ($4, $5, 'pending')
         RETURNING id, status`,
        [
          stands.rows[0].id,
          stands.rows[1].id,
          stands.rows[2].id,
          stands.rows[3].id,
          festival.rows[0].id,
        ],
      );
      const invoices = await client!.query<{ id: number }>(
        `INSERT INTO "invoices"
           ("original_amount", "discount_amount", "amount", "date", "status", "user_id", "reservation_id")
         SELECT 100, 0, 100, now(), 'paid', $1, id
         FROM unnest($2::int[]) WITH ORDINALITY AS reservation_ids(id, position)
         ORDER BY position
         RETURNING id`,
        [user.rows[0].id, reservations.rows.map((row) => row.id)],
      );
      const payments = await client!.query<{ id: number }>(
        `INSERT INTO "payments" ("amount", "date", "invoice_id", "voucher_url")
         SELECT 100, now(), id, $1 || id
         FROM unnest($2::int[]) WITH ORDINALITY AS invoice_ids(id, position)
         ORDER BY position
         RETURNING id`,
        [
          `https://example.test/${suffix}-`,
          invoices.rows.map((invoice) => invoice.id),
        ],
      );

      await client!.query(migration);
      await client!.query(migration);

      const submissions = await client!.query<{
        invoice_id: number;
        payment_id: number;
        status: string;
        terminal_status: string;
      }>(
        `SELECT
           "invoice_id",
           "payment_id",
           "status",
           "evidence_snapshot"->>'terminalReservationStatus' AS terminal_status
         FROM "invoice_settlement_submissions"
         WHERE invoice_id = ANY($1)
         ORDER BY invoice_id`,
        [invoices.rows.map((invoice) => invoice.id)],
      );

      expect(submissions.rows).toEqual(
        invoices.rows.slice(0, 3).map((invoice, index) => ({
          invoice_id: invoice.id,
          payment_id: payments.rows[index].id,
          status: "approved",
          terminal_status: reservations.rows[index].status,
        })),
      );
    } finally {
      await client!.query("ROLLBACK").catch(() => undefined);
    }
  });
});
