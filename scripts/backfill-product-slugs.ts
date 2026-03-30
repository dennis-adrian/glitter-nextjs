import { asc, eq, isNotNull, isNull } from "drizzle-orm";

import {
	allocateUniqueSlugFromUsedSet,
	slugifyName,
} from "@/app/lib/products/slug";
import { db } from "@/db";
import { products } from "@/db/schema";

/**
 * Fills products.slug for rows that are still null (post–0165 migration).
 * Deterministic: order by id ascending; same collision rules as runtime.
 */
export async function backfillProductSlugs(): Promise<void> {
	const rows = await db
		.select({ id: products.id, name: products.name, slug: products.slug })
		.from(products)
		.where(isNull(products.slug))
		.orderBy(asc(products.id));

	if (rows.length === 0) {
		return;
	}

	const existingSlugs = await db
		.select({ slug: products.slug })
		.from(products)
		.where(isNotNull(products.slug));

	const used = new Set<string>(
		existingSlugs.map((r) => r.slug).filter((s): s is string => s.length > 0),
	);

	for (const row of rows) {
		let base = slugifyName(row.name);
		if (!base) {
			base = `product-${row.id}`;
		}
		const slug = allocateUniqueSlugFromUsedSet(used, base, row.id);
		await db.update(products).set({ slug }).where(eq(products.id, row.id));
	}
}
