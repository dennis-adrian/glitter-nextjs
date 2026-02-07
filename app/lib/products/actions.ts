"use server";

import { db } from "@/db";

export async function fetchProducts() {
	try {
		return await db.query.products.findMany({
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

export async function fetchFeaturedProducts(limit = 4) {
	try {
		return await db.query.products.findMany({
			with: {
				images: true,
			},
			orderBy: (products, { desc }) => [desc(products.createdAt)],
			limit,
		});
	} catch (error) {
		console.error(error);
		return [];
	}
}
