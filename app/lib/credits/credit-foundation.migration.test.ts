import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("credit accounting foundation migration", () => {
  it("creates immutable, idempotent accounting tables", async () => {
    const [foundation, integrity] = await Promise.all([
      readFile(
        resolve(process.cwd(), "drizzle/0256_credit_accounting_foundation.sql"),
        "utf8",
      ),
      readFile(
        resolve(process.cwd(), "drizzle/0259_credit_ledger_integrity.sql"),
        "utf8",
      ),
    ]);
    const migration = `${foundation}\n${integrity}`;

    expect(migration).toContain('CREATE TABLE "credit_accounts"');
    expect(migration).toContain('CREATE TABLE "credit_ledger_entries"');
    expect(migration).toContain('CREATE TABLE "credit_top_ups"');
    expect(migration).toContain('CREATE TABLE "credit_holds"');
    expect(migration).toContain('CREATE TABLE "invoice_credit_allocations"');
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "credit_ledger_entries_top_up_reversal_unique"',
    );
    expect(migration).toContain(
      'CONSTRAINT "credit_ledger_entries_posted_only"',
    );
    expect(migration).toContain(
      'CONSTRAINT "credit_ledger_entries_type_amount_direction"',
    );
    expect(migration).toContain(
      'CREATE TRIGGER "credit_ledger_entries_append_only"',
    );
    expect(migration).toContain(
      'CONSTRAINT "credit_top_ups_deadline_after_created"',
    );
  });
});
