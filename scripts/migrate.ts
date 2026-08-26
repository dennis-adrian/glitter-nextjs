import { migrate } from "drizzle-orm/node-postgres/migrator";
import { pool, db } from "@/db";

import { backfillCategoryCatalog } from "./backfill-categories";
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

const CATEGORY_CATALOG_BACKFILL = "0236_manageable_categories";

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

async function ensureCategoryCatalogBackfillMarker() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS category_catalog_backfill (
        name text PRIMARY KEY,
        completed_at timestamp NOT NULL DEFAULT now()
      )
    `);
  } finally {
    client.release();
  }
}

async function categoryCatalogBackfillCompleted(): Promise<boolean> {
  await ensureCategoryCatalogBackfillMarker();
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT 1 FROM category_catalog_backfill WHERE name = $1`,
      [CATEGORY_CATALOG_BACKFILL],
    );
    return rows.length > 0;
  } finally {
    client.release();
  }
}

async function markCategoryCatalogBackfillCompleted() {
  await ensureCategoryCatalogBackfillMarker();
  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO category_catalog_backfill (name) VALUES ($1)
       ON CONFLICT (name) DO NOTHING`,
      [CATEGORY_CATALOG_BACKFILL],
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
    const catalogPending = await catalogMigrationPending();
    const catalogBackfillDone = catalogPending
      ? false
      : await categoryCatalogBackfillCompleted();

    await migrate(db, { migrationsFolder: "./drizzle" });
    await backfillProductSlugs();
    await ensureProductSlugConstraints();
    if (catalogPending || !catalogBackfillDone) {
      await backfillCategoryCatalog();
      await markCategoryCatalogBackfillCompleted();
    }
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
