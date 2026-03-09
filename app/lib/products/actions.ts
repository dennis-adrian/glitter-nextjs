"use server";

import { db } from "@/db";

export async function fetchProducts() {
	try {
		return await db.query.products.findMany({
			with: {
				images: true,
			},
			orderBy: (products, { desc }) => [desc(products.isFeatured), desc(products.createdAt)],
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
