import { migrate } from "drizzle-orm/node-postgres/migrator";
import { pool, db } from "@/db";

import { backfillProductSlugs } from "./backfill-product-slugs";

/**
 * After 0165 adds nullable `slug`, backfill fills values; then match schema.ts
 * (NOT NULL + unique) without a separate Drizzle migration (would run before backfill).
 */
async function ensureProductSlugConstraints() {
  const client = await pool.connect();
  try {
    const col = await client.query<{ is_nullable: string }>(
      `SELECT is_nullable FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'slug'`,
    );
    if (col.rows.length === 0) {
      return;
    }

    if (col.rows[0].is_nullable === "YES") {
      const { rows } = await client.query<{ c: string }>(
        `SELECT count(*)::text AS c FROM products WHERE slug IS NULL`,
      );
      if (Number(rows[0].c) > 0) {
        throw new Error(
          `products.slug: ${rows[0].c} row(s) still null after backfill; cannot SET NOT NULL`,
        );
      }
      await client.query(`ALTER TABLE products ALTER COLUMN slug SET NOT NULL`);
    }

    const existing = await client.query(
      `SELECT 1 FROM pg_constraint WHERE conname = 'products_slug_unique'`,
    );
    if (existing.rows.length === 0) {
      await client.query(
        `ALTER TABLE products ADD CONSTRAINT products_slug_unique UNIQUE (slug)`,
      );
    }
  } finally {
    client.release();
  }
}

async function ensureTicketNumberUniqueConstraint() {
  const client = await pool.connect();
  const constraintName = "tickets_festival_id_ticket_number_unique";
  try {
    const constraint = await client.query(
      `SELECT 1
       FROM pg_constraint
       INNER JOIN pg_class ON pg_class.oid = pg_constraint.conrelid
       INNER JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
       WHERE pg_constraint.conname = $1
         AND pg_class.relname = 'tickets'
         AND pg_namespace.nspname = 'public'`,
      [constraintName],
    );
    if (constraint.rows.length > 0) return;

    const duplicates = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM (
         SELECT 1
         FROM tickets
         WHERE ticket_number IS NOT NULL
         GROUP BY festival_id, ticket_number
         HAVING count(*) > 1
       ) AS duplicate_pairs`,
    );
    if (Number(duplicates.rows[0].count) > 0) {
      throw new Error(
        `tickets: ${duplicates.rows[0].count} duplicate festival/ticket-number pair(s) remain`,
      );
    }

    const index = await client.query<{ indisvalid: boolean }>(
      `SELECT pg_index.indisvalid
       FROM pg_class AS index_class
       INNER JOIN pg_index ON pg_index.indexrelid = index_class.oid
       INNER JOIN pg_class AS table_class ON table_class.oid = pg_index.indrelid
       INNER JOIN pg_namespace ON pg_namespace.oid = table_class.relnamespace
       WHERE index_class.relname = $1
         AND table_class.relname = 'tickets'
         AND pg_namespace.nspname = 'public'`,
      [constraintName],
    );
    if (index.rows[0] && !index.rows[0].indisvalid) {
      await client.query(
        `DROP INDEX CONCURRENTLY "tickets_festival_id_ticket_number_unique"`,
      );
    }
    if (!index.rows[0] || !index.rows[0].indisvalid) {
      await client.query(
        `CREATE UNIQUE INDEX CONCURRENTLY "tickets_festival_id_ticket_number_unique"
         ON "tickets" ("festival_id", "ticket_number")`,
      );
    }

    await client.query(
      `ALTER TABLE "tickets"
       ADD CONSTRAINT "tickets_festival_id_ticket_number_unique"
       UNIQUE USING INDEX "tickets_festival_id_ticket_number_unique"`,
    );
  } finally {
    client.release();
  }
}

async function main() {
  if (!process.env.POSTGRES_URL) {
    console.info("POSTGRES_URL is not set. Skipping migration.");
    await pool.end();
    return;
  }

  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    await ensureTicketNumberUniqueConstraint();
    await backfillProductSlugs();
    await ensureProductSlugConstraints();
    console.info("Migration completed successfully.");
  } catch (error: unknown) {
    const pgError = error as { code?: string };
    if (pgError.code === "ECONNREFUSED") {
      console.warn(
        "Could not connect to the database. Skipping migration. " +
          "Make sure your database is running and POSTGRES_URL is correct.",
      );
    } else {
      throw error;
    }
  } finally {
    await pool.end();
  }
}

main();
