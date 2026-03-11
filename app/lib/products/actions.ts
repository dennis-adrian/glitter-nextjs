"use server";

import { db } from "@/db";
import { asc, desc, eq, lte, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { productImages, products } from "@/db/schema";

type NewProductData = {
	name: string;
	description?: string | null;
	price: number;
	stock?: number | null;
	status?: "available" | "presale" | "sale";
	discount?: number | null;
	discountUnit?: "percentage" | "amount";
	isPreOrder?: boolean;
	availableDate?: Date | null;
	isFeatured?: boolean;
	isNew?: boolean;
	imageUrls?: string[];
	mainImageUrl?: string | null;
};

function normalizeAvailableDate(
	date: Date | null | undefined,
): Date | null | undefined {
	if (!date) return date;
	const d = new Date(date);
	d.setUTCHours(12, 0, 0, 0);
	return d;
}

export async function createProduct(data: NewProductData) {
	const { imageUrls, mainImageUrl, ...productData } = data;
	if (productData.availableDate) {
		productData.availableDate = normalizeAvailableDate(
			productData.availableDate,
		);
	}
	try {
		await db.transaction(async (tx) => {
			const [product] = await tx.insert(products).values(productData).returning();

			if (imageUrls && imageUrls.length > 0) {
				await tx.insert(productImages).values(
					imageUrls.map((url) => ({
						productId: product.id,
						imageUrl: url,
						isMain: url === mainImageUrl,
					})),
				);
			}
		});
	} catch (error) {
		console.error(error);
		return { success: false, message: "No se pudo crear el producto." };
	}

	revalidatePath("/dashboard/store/products");
	revalidatePath("/store");
	return { success: true, message: "Producto creado correctamente." };
}

export async function updateProduct(id: number, data: NewProductData) {
	const { imageUrls, mainImageUrl, ...productData } = data;
	if (productData.availableDate) {
		productData.availableDate = normalizeAvailableDate(
			productData.availableDate,
		);
	}
	try {
		await db.transaction(async (tx) => {
			await tx
				.update(products)
				.set({ ...productData, updatedAt: new Date() })
				.where(eq(products.id, id));

			if (imageUrls !== undefined) {
				await tx.delete(productImages).where(eq(productImages.productId, id));

				if (imageUrls.length > 0) {
					await tx.insert(productImages).values(
						imageUrls.map((url) => ({
							productId: id,
							imageUrl: url,
							isMain: url === mainImageUrl,
						})),
					);
				}
			}
		});
	} catch (error) {
		console.error(error);
		return { success: false, message: "No se pudo actualizar el producto." };
	}

	revalidatePath("/dashboard/store/products");
	revalidatePath(`/store/products/${id}`);
	revalidatePath("/store");
	return { success: true, message: "Producto actualizado correctamente." };
}

export async function deleteProduct(id: number) {
	try {
		await db.delete(products).where(eq(products.id, id));
	} catch (error) {
		console.error(error);
		return { success: false, message: "No se pudo eliminar el producto." };
	}

	revalidatePath("/dashboard/store/products");
	revalidatePath("/store");
	return { success: true, message: "Producto eliminado correctamente." };
}

/**
 * Product fetchers use safe fallbacks on error: they do not throw.
 * - fetchProduct returns undefined when not found, null on error.
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

export async function fetchLowStockProducts(threshold = 5) {
	try {
		return await db
			.select()
			.from(products)
			.where(lte(products.stock, threshold))
			.orderBy(asc(products.stock));
	} catch (error) {
		console.error(error);
		return [];
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
