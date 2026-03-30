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

async function main() {
	if (!process.env.POSTGRES_URL) {
		console.info("POSTGRES_URL is not set. Skipping migration.");
		await pool.end();
		return;
	}

	try {
		await migrate(db, { migrationsFolder: "./drizzle" });
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
