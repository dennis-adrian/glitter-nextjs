// @vitest-environment node

import { Pool, type PoolClient } from "pg";
import { afterAll, describe, expect, it } from "vitest";

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
  ? new Pool({ connectionString: testDatabaseUrl })
  : null;
const describeDatabase = pool ? describe : describe.skip;

async function expectAppendOnlyDeleteFailure(
  client: PoolClient,
  statement: string,
) {
  await client.query("SAVEPOINT append_only_delete");
  await expect(client.query(statement)).rejects.toThrow(
    "credit ledger entries are append-only",
  );
  await client.query("ROLLBACK TO SAVEPOINT append_only_delete");
}

describeDatabase("credit ledger append-only protection", () => {
  afterAll(async () => {
    await pool?.end();
  });

  it("rejects direct and unrelated nested deletes while retaining ledger history", async () => {
    const client = await pool!.connect();
    try {
      await client.query("BEGIN");
      const ledgerUserForeignKey = await client.query(
        `SELECT confdeltype
         FROM pg_constraint
         WHERE conname = 'credit_ledger_entries_user_id_users_id_fk'`,
      );
      expect(ledgerUserForeignKey.rows).toEqual([{ confdeltype: "r" }]);

      const appendOnlyTrigger = await client.query(`
        SELECT
          proc.proname AS function_name,
          (trg.tgtype & 8) <> 0 AS handles_delete,
          (trg.tgtype & 16) <> 0 AS handles_update
        FROM pg_trigger AS trg
        JOIN pg_class AS cls ON cls.oid = trg.tgrelid
        JOIN pg_proc AS proc ON proc.oid = trg.tgfoid
        WHERE trg.tgname = 'credit_ledger_entries_append_only'
          AND cls.relname = 'credit_ledger_entries'
          AND NOT trg.tgisinternal
      `);
      expect(appendOnlyTrigger.rows).toEqual([
        {
          function_name: "prevent_credit_ledger_entry_mutation",
          handles_delete: true,
          handles_update: true,
        },
      ]);

      await client.query(`
        CREATE TEMP TABLE credit_ledger_test_users (id integer PRIMARY KEY);
        CREATE TEMP TABLE credit_ledger_test_entries (
          id integer PRIMARY KEY,
          user_id integer NOT NULL REFERENCES credit_ledger_test_users(id) ON DELETE RESTRICT
        );
        CREATE TEMP TABLE credit_ledger_test_delete_driver (id integer PRIMARY KEY);
        CREATE TRIGGER credit_ledger_test_append_only
          BEFORE UPDATE OR DELETE ON credit_ledger_test_entries
          FOR EACH ROW EXECUTE FUNCTION prevent_credit_ledger_entry_mutation();
        CREATE FUNCTION pg_temp.delete_credit_ledger_test_entry()
          RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          DELETE FROM credit_ledger_test_entries WHERE id = 1;
          RETURN OLD;
        END;
        $$;
        CREATE TRIGGER credit_ledger_test_nested_delete
          BEFORE DELETE ON credit_ledger_test_delete_driver
          FOR EACH ROW EXECUTE FUNCTION pg_temp.delete_credit_ledger_test_entry();
        INSERT INTO credit_ledger_test_users VALUES (1);
        INSERT INTO credit_ledger_test_entries VALUES (1, 1);
        INSERT INTO credit_ledger_test_delete_driver VALUES (1);
      `);

      await expectAppendOnlyDeleteFailure(
        client,
        "DELETE FROM credit_ledger_test_entries WHERE id = 1",
      );
      await expectAppendOnlyDeleteFailure(
        client,
        "DELETE FROM credit_ledger_test_delete_driver WHERE id = 1",
      );

      await client.query("SAVEPOINT user_delete");
      await expect(
        client.query("DELETE FROM credit_ledger_test_users WHERE id = 1"),
      ).rejects.toThrow(/violates foreign key constraint/);
      await client.query("ROLLBACK TO SAVEPOINT user_delete");

      const entries = await client.query(
        "SELECT id FROM credit_ledger_test_entries WHERE id = 1",
      );
      expect(entries.rows).toEqual([{ id: 1 }]);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
});
