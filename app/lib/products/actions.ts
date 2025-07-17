"use server";

import { db } from "@/db";

export async function fetchProducts() {
	try {
		return await db.query.products.findMany({
			orderBy: (products, { desc }) => [desc(products.createdAt)],
		});
	} catch (error) {
		console.error(error);
		return [];
	}
}
