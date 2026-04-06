"use server";

import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { ensureUniqueSlug, slugifyName } from "@/app/lib/products/slug";
import { db } from "@/db";
import { and, asc, desc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
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
	isVisible?: boolean;
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
	const currentProfile = await getCurrentUserProfile();
	if (!currentProfile || currentProfile.role !== "admin") {
		return {
			success: false,
			message: "No tienes permisos para realizar esta acción.",
		};
	}
	const { imagePayloads = [], ...productData } = data;
	if (productData.availableDate) {
		productData.availableDate = normalizeAvailableDate(
			productData.availableDate,
		);
	}
	let createdSlug: string | undefined;
	try {
		await db.transaction(async (tx) => {
			const insertData = {
				...productData,
				availableDate:
					productData.availableDate != null
						? normalizeAvailableDate(productData.availableDate)
						: productData.availableDate,
			} as typeof productData & { availableDate?: Date | null };
			const baseSlug = slugifyName(productData.name);
			const slug = await ensureUniqueSlug(tx, baseSlug);
			const [product] = await tx
				.insert(products)
				.values({ ...insertData, slug })
				.returning();
			createdSlug = product.slug;

			for (const img of imagePayloads) {
				const updated = await tx
					.update(productImages)
					.set({
						productId: product.id,
						uploadStatus: "active",
						isMain: img.isMain,
						updatedAt: new Date(),
					})
					.where(
						and(
							eq(productImages.id, img.id),
							isNull(productImages.productId),
							eq(productImages.uploadStatus, "pending"),
						),
					)
					.returning({ id: productImages.id });
				if (updated.length === 0) {
					throw new Error("Image payload not found or already assigned");
				}
			}
		});
	} catch (error) {
		console.error(error);
		return { success: false, message: "No se pudo crear el producto." };
	}

	revalidatePath("/dashboard/store/products");
	if (createdSlug) {
		revalidatePath(`/store/products/${createdSlug}`);
	}
	revalidatePath("/store");
	return { success: true, message: "Producto creado correctamente." };
}

export async function updateProduct(id: number, data: NewProductData) {
	const currentProfile = await getCurrentUserProfile();
	if (!currentProfile || currentProfile.role !== "admin") {
		return {
			success: false,
			message: "No tienes permisos para realizar esta acción.",
		};
	}
	const { imagePayloads = [], ...productData } = data;
	if (productData.availableDate) {
		productData.availableDate = normalizeAvailableDate(
			productData.availableDate,
		);
	}
	let previousSlug: string | undefined;
	let nextSlug: string | undefined;
	try {
		await db.transaction(async (tx) => {
			const existing = await tx.query.products.findFirst({
				where: eq(products.id, id),
			});
			if (!existing) {
				throw new Error("Product not found");
			}
			previousSlug = existing.slug;

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
				slug?: string;
			};

			if (productData.name !== existing.name) {
				const baseSlug = slugifyName(productData.name);
				nextSlug = await ensureUniqueSlug(tx, baseSlug, id, id);
				updateData.slug = nextSlug;
			}

			await tx.update(products).set(updateData).where(eq(products.id, id));

			for (const img of imagePayloads) {
				const updated = await tx
					.update(productImages)
					.set({
						productId: id,
						uploadStatus: "active",
						isMain: img.isMain,
						updatedAt: new Date(),
					})
					.where(
						and(
							eq(productImages.id, img.id),
							or(
								isNull(productImages.productId),
								eq(productImages.productId, id),
							),
							inArray(productImages.uploadStatus, ["pending", "active"]),
						),
					)
					.returning({ id: productImages.id });
				if (updated.length === 0) {
					throw new Error(
						"Image payload not found or not claimable for this product",
					);
				}
			}
		});
	} catch (error) {
		console.error(error);
		return { success: false, message: "No se pudo actualizar el producto." };
	}

	revalidatePath("/dashboard/store/products");
	if (previousSlug) {
		revalidatePath(`/store/products/${previousSlug}`);
	}
	if (nextSlug && nextSlug !== previousSlug) {
		revalidatePath(`/store/products/${nextSlug}`);
	}
	revalidatePath("/store");
	return { success: true, message: "Producto actualizado correctamente." };
}

export async function deleteProduct(id: number) {
	const currentProfile = await getCurrentUserProfile();
	if (!currentProfile || currentProfile.role !== "admin") {
		return {
			success: false,
			message: "No tienes permisos para realizar esta acción.",
		};
	}
	let deletedSlug: string | undefined;
	try {
		const row = await db.query.products.findFirst({
			where: eq(products.id, id),
			columns: { slug: true },
		});
		deletedSlug = row?.slug;
		await db.delete(products).where(eq(products.id, id));
	} catch (error) {
		console.error(error);
		return { success: false, message: "No se pudo eliminar el producto." };
	}

	revalidatePath("/dashboard/store/products");
	if (deletedSlug) {
		revalidatePath(`/store/products/${deletedSlug}`);
	}
	revalidatePath("/store");
	return { success: true, message: "Producto eliminado correctamente." };
}

/**
 * Product fetchers use safe fallbacks on error: they do not throw.
 * - fetchProduct returns undefined when not found, null on error.
 * - fetchProducts and fetchFeaturedProducts return [] on error.
 * Callers can rely on these defaults without try/catch.
 */

export async function fetchProducts(
	sort: "default" | "updatedAt" = "default",
	options: { visibleOnly?: boolean } = {},
) {
	const { visibleOnly = false } = options;
	try {
		return await db.query.products.findMany({
			where: visibleOnly ? eq(products.isVisible, true) : undefined,
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

export async function fetchProductBySlug(
	slug: string,
	options: { visibleOnly?: boolean } = {},
) {
	const { visibleOnly = false } = options;
	try {
		return await db.query.products.findFirst({
			where: (products, { eq, and }) =>
				visibleOnly
					? and(eq(products.slug, slug), eq(products.isVisible, true))
					: eq(products.slug, slug),
			with: {
				images: true,
			},
		});
	} catch (error) {
		console.error(error);
		return null;
	}
}

export async function toggleProductVisibility(
	id: number,
	isVisible: boolean,
): Promise<{ success: boolean; message: string }> {
	const currentProfile = await getCurrentUserProfile();
	if (!currentProfile || currentProfile.role !== "admin") {
		return {
			success: false,
			message: "No tienes permisos para realizar esta acción.",
		};
	}
	try {
		const [updated] = await db
			.update(products)
			.set({ isVisible, updatedAt: new Date() })
			.where(eq(products.id, id))
			.returning({ slug: products.slug });

		if (!updated) {
			return { success: false, message: "Producto no encontrado." };
		}

		revalidatePath(`/store/products/${updated.slug}`);
	} catch (error) {
		console.error(error);
		return { success: false, message: "No se pudo actualizar la visibilidad." };
	}
	revalidatePath("/dashboard/store/products");
	revalidatePath("/store");
	return {
		success: true,
		message: isVisible ? "Producto visible." : "Producto oculto.",
	};
}

export async function updateProductStock(
	id: number,
	stock: number | null,
): Promise<{ success: boolean; message: string }> {
	const currentProfile = await getCurrentUserProfile();
	if (!currentProfile || currentProfile.role !== "admin") {
		return {
			success: false,
			message: "No tienes permisos para realizar esta acción.",
		};
	}

	let validatedStock: number | null = stock;
	if (stock !== null) {
		if (!Number.isFinite(stock) || !Number.isInteger(stock) || stock < 0) {
			return {
				success: false,
				message: "El stock debe ser un numero entero mayor o igual a 0.",
			};
		}
		validatedStock = stock;
	}

	try {
		const [updated] = await db
			.update(products)
			.set({ stock: validatedStock, updatedAt: new Date() })
			.where(eq(products.id, id))
			.returning({ slug: products.slug });

		if (!updated) {
			return { success: false, message: "Producto no encontrado." };
		}

		revalidatePath(`/store/products/${updated.slug}`);
		revalidatePath("/dashboard/store/products");
		revalidatePath("/dashboard/store/analytics");
		revalidatePath("/store");
		return { success: true, message: "Stock actualizado." };
	} catch (error) {
		console.error(error);
		return { success: false, message: "No se pudo actualizar el stock." };
	}
}

export async function bulkToggleProductVisibility(
	ids: number[],
	isVisible: boolean,
): Promise<{ success: boolean; message: string; slugs: string[] }> {
	if (ids.length === 0) {
		return {
			success: true,
			message: "No hay productos seleccionados.",
			slugs: [],
		};
	}
	const currentProfile = await getCurrentUserProfile();
	if (!currentProfile || currentProfile.role !== "admin") {
		return {
			success: false,
			message: "No tienes permisos para realizar esta acción.",
			slugs: [],
		};
	}
	let slugs: string[] = [];
	try {
		await db
			.update(products)
			.set({ isVisible, updatedAt: new Date() })
			.where(inArray(products.id, ids));

		const updatedRows = await db
			.select({ slug: products.slug })
			.from(products)
			.where(inArray(products.id, ids));
		slugs = updatedRows.map((row) => row.slug);
	} catch (error) {
		console.error(error);
		return {
			success: false,
			message: "No se pudo actualizar la visibilidad.",
			slugs: [],
		};
	}
	revalidatePath("/dashboard/store/products");
	revalidatePath("/store");
	for (const slug of slugs) {
		revalidatePath(`/store/products/${slug}`);
	}
	return {
		success: true,
		message: isVisible
			? `${ids.length} productos visibles.`
			: `${ids.length} productos ocultos.`,
		slugs,
	};
}

export async function bulkDeleteProducts(
	ids: number[],
): Promise<{ success: boolean; message: string }> {
	if (ids.length === 0) {
		return { success: true, message: "No hay productos seleccionados." };
	}
	const currentProfile = await getCurrentUserProfile();
	if (!currentProfile || currentProfile.role !== "admin") {
		return {
			success: false,
			message: "No tienes permisos para realizar esta acción.",
		};
	}
	let deletedSlugs: string[] = [];
	try {
		const rows = await db
			.select({ slug: products.slug })
			.from(products)
			.where(inArray(products.id, ids));
		deletedSlugs = rows.map((row) => row.slug);

		await db.delete(products).where(inArray(products.id, ids));
	} catch (error) {
		console.error(error);
		return { success: false, message: "No se pudo eliminar los productos." };
	}
	revalidatePath("/dashboard/store/products");
	for (const slug of deletedSlugs) {
		revalidatePath(`/store/products/${slug}`);
	}
	revalidatePath("/store");
	return { success: true, message: `${ids.length} productos eliminados.` };
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
			where: (products, { eq, and }) =>
				and(eq(products.isFeatured, true), eq(products.isVisible, true)),
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
