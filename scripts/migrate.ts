import { migrate } from "drizzle-orm/node-postgres/migrator";
import { pool, db } from "@/db";

import {
  backfillCategoryCatalog,
  categoryCatalogBackfillCompleted,
  invoiceVerificationPaymentBackfillCompleted,
  markCategoryCatalogBackfillCompleted,
  markInvoiceVerificationPaymentBackfillCompleted,
} from "./backfill-categories";
import { backfillProductSlugs } from "./backfill-product-slugs";
import { ensureDefaultFestivalTerms } from "@/app/lib/festival-terms/persist";
import { ensureReservationPhase4Indexes } from "./lib/reservation-phase4-indexes";

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

async function catalogMigrationPending(): Promise<boolean> {
  const client = await pool.connect();
  try {
    const col = await client.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'subcategories'
         AND column_name = 'description_json'`,
    );
    return col.rows.length === 0;
  } finally {
    client.release();
  }
}

async function ensureFestivalTermsArchivedEnum() {
  const client = await pool.connect();
  try {
    // Safety net for DBs that already applied an older 0237 without `archived`.
    // Fresh installs create the label in 0237's CREATE TYPE. Postgres refuses
    // to use a newly ADD VALUE'd enum label until that transaction commits, so
    // if the type exists without `archived`, add it here (autocommit) before
    // migrate() runs 0239's backfill SQL that references the label.
    await client.query(
      `ALTER TYPE "public"."festival_terms_version_status" ADD VALUE IF NOT EXISTS 'archived'`,
    );
  } catch (error: unknown) {
    const pgError = error as { code?: string };
    // Type may not exist yet on a fresh DB; 0237 creates it with `archived`.
    if (pgError.code === "42704") {
      return;
    }
    throw error;
  } finally {
    client.release();
  }
}

async function ensureReservationPhase4IndexesOnPool() {
  const client = await pool.connect();
  try {
    await ensureReservationPhase4Indexes(client);
  } finally {
    client.release();
  }
}

async function backfillInvoiceVerificationPayment() {
  const client = await pool.connect();
  try {
    // 0244 adds invoice_status.verification_payment. Postgres refuses to use a
    // newly ADD VALUE'd label until that transaction commits, so this UPDATE
    // cannot live in the same Drizzle migration file as the ALTER TYPE.
    await client.query(`
      UPDATE invoices AS i
      SET status = 'verification_payment', updated_at = now()
      FROM stand_reservations AS r
      WHERE i.reservation_id = r.id
        AND i.status = 'pending'
        AND r.status = 'verification_payment'
    `);
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
    const catalogPending = await catalogMigrationPending();
    const catalogBackfillDone = catalogPending
      ? false
      : await categoryCatalogBackfillCompleted();
    const invoiceBackfillDone =
      await invoiceVerificationPaymentBackfillCompleted();

    await ensureFestivalTermsArchivedEnum();
    await migrate(db, { migrationsFolder: "./drizzle" });
    await ensureReservationPhase4IndexesOnPool();
    if (!invoiceBackfillDone) {
      await backfillInvoiceVerificationPayment();
      await markInvoiceVerificationPaymentBackfillCompleted();
    }
    await backfillProductSlugs();
    await ensureProductSlugConstraints();
    if (catalogPending || !catalogBackfillDone) {
      await backfillCategoryCatalog();
      await markCategoryCatalogBackfillCompleted();
    }
    await ensureDefaultFestivalTerms();
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
