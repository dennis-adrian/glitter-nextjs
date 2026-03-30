import { and, eq, ne } from "drizzle-orm";

import { db } from "@/db";
import { products } from "@/db/schema";

const MAX_SLUG_LENGTH = 120;

type DbOrTx =
	| typeof db
	| Parameters<Parameters<typeof db.transaction>[0]>[0];

/** URL-safe slug from display name (hyphen-separated, lowercase). */
export function slugifyName(name: string): string {
	const stripped = name
		.normalize("NFD")
		.replace(/\p{M}/gu, "")
		.toLowerCase()
		.trim();

	const slug = stripped
		.replace(/[^\p{L}\p{N}]+/gu, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, MAX_SLUG_LENGTH);

	return slug;
}

/**
 * Picks the first unused slug: base, base-2, base-3, …
 * @param excludeProductId — when updating, ignore this row’s current slug so it can keep or reclaim its slot.
 * @param fallbackProductId — when baseSlug is empty or whitespace-only after trim, use `product-${fallbackProductId}` (e.g. when updating an existing row). Omit for inserts before an id exists; then the base is `"product"`.
 */
export async function ensureUniqueSlug(
	tx: DbOrTx,
	baseSlug: string,
	excludeProductId?: number,
	fallbackProductId?: number,
): Promise<string> {
	const trimmed = baseSlug.trim();
	const base =
		trimmed ||
		(fallbackProductId !== undefined
			? `product-${fallbackProductId}`
			: "product");
	let candidate = base;
	let n = 2;

	while (await isSlugTaken(tx, candidate, excludeProductId)) {
		candidate = `${base}-${n}`;
		n++;
	}

	return candidate;
}

async function isSlugTaken(
	tx: DbOrTx,
	slug: string,
	excludeProductId?: number,
): Promise<boolean> {
	const where =
		excludeProductId !== undefined
			? and(eq(products.slug, slug), ne(products.id, excludeProductId))
			: eq(products.slug, slug);

	const rows = await tx.select({ id: products.id }).from(products).where(where).limit(1);

	return rows.length > 0;
}

/**
 * Deterministic slug assignment for backfill: order by id, track used slugs in memory.
 */
export function allocateUniqueSlugFromUsedSet(
	used: Set<string>,
	baseSlug: string,
	productId: number,
): string {
	let base = baseSlug.trim() || `product-${productId}`;
	let candidate = base;
	let n = 2;

	while (used.has(candidate)) {
		candidate = `${base}-${n}`;
		n++;
	}

	used.add(candidate);
	return candidate;
}
