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
	availableDate?: Date | string | null;
	isFeatured?: boolean;
	isNew?: boolean;
	imagePayloads?: { id: number; isMain: boolean }[];
};

function normalizeAvailableDate(
	date: Date | string | null | undefined,
): Date | null | undefined {
	if (date === null || date === undefined) return date;
	const d =
		typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)
			? new Date(`${date}T12:00:00.000Z`)
			: new Date(date);
	d.setUTCHours(12, 0, 0, 0);
	return d;
}

export async function createProduct(data: NewProductData) {
	const { imagePayloads = [], ...productData } = data;
	if (productData.availableDate) {
		productData.availableDate = normalizeAvailableDate(
			productData.availableDate,
		);
	}
	try {
		await db.transaction(async (tx) => {
			const insertData = {
				...productData,
				availableDate:
					productData.availableDate != null
						? normalizeAvailableDate(productData.availableDate)
						: productData.availableDate,
			} as typeof productData & { availableDate?: Date | null };
			const [product] = await tx
				.insert(products)
				.values(insertData)
				.returning();

			for (const img of imagePayloads) {
				await tx
					.update(productImages)
					.set({
						productId: product.id,
						uploadStatus: "active",
						isMain: img.isMain,
						updatedAt: new Date(),
					})
					.where(eq(productImages.id, img.id));
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
	const { imagePayloads = [], ...productData } = data;
	if (productData.availableDate) {
		productData.availableDate = normalizeAvailableDate(
			productData.availableDate,
		);
	}
	try {
		await db.transaction(async (tx) => {
			const updateData = {
				...productData,
				availableDate:
					productData.availableDate != null
						? normalizeAvailableDate(productData.availableDate)
						: productData.availableDate,
				updatedAt: new Date(),
			} as typeof productData & {
				availableDate?: Date | null;
				updatedAt: Date;
			};
			await tx.update(products).set(updateData).where(eq(products.id, id));

			for (const img of imagePayloads) {
				await tx
					.update(productImages)
					.set({
						productId: id,
						uploadStatus: "active",
						isMain: img.isMain,
						updatedAt: new Date(),
					})
					.where(eq(productImages.id, img.id));
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

export async function fetchProducts(sort: "default" | "updatedAt" = "default") {
	try {
		return await db.query.products.findMany({
			with: {
				images: true,
			},
			orderBy:
				sort === "updatedAt"
					? [desc(products.updatedAt)]
					: [
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
