"use server";

import { db } from "@/db";

export async function fetchProducts() {
	try {
		return await db.query.products.findMany();
	} catch (error) {
		console.error(error);
		return [];
	}
}
