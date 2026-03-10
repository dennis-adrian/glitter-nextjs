"use server";

import { db } from "@/db";
import { desc, sql } from "drizzle-orm";
import { products } from "@/db/schema";

/**
 * Product fetchers use safe fallbacks on error: they do not throw.
 * - fetchProduct returns null on error or when not found.
 * - fetchProducts and fetchFeaturedProducts return [] on error.
 * Callers can rely on these defaults without try/catch.
 */

export async function fetchProducts() {
	try {
		return await db.query.products.findMany({
			with: {
				images: true,
			},
			orderBy: [
				desc(products.isFeatured),
				sql`CASE WHEN ${products.stock} > 0 THEN 0 ELSE 1 END`,
				desc(products.createdAt),
			],
		});
	} catch (error) {
		console.error(error);
		return [];
	}
}

export async function fetchProduct(id: number) {
	try {
		return await db.query.products.findFirst({
			where: (products, { eq }) => eq(products.id, id),
			with: {
				images: true,
			},
		});
	} catch (error) {
		console.error(error);
		return null;
	}
}

export async function fetchFeaturedProducts() {
	try {
		return await db.query.products.findMany({
			where: (products, { eq }) => eq(products.isFeatured, true),
			with: {
				images: true,
			},
			orderBy: (products, { desc }) => [desc(products.createdAt)],
		});
	} catch (error) {
		console.error(error);
		return [];
	}
}
