"use server";

import { db } from "@/db";
import { productImages } from "@/db/schema";
import { utapi } from "@/app/server/uploadthing";
import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";

export async function handleOrphanedProductImages(): Promise<number> {
	try {
		const orphaned = await db
			.select({ id: productImages.id, imageUrl: productImages.imageUrl })
			.from(productImages)
			.where(
				and(
					eq(productImages.uploadStatus, "pending"),
					isNull(productImages.productId),
					lt(productImages.createdAt, sql`now() - interval '24 hours'`),
				),
			);

		if (orphaned.length === 0) return 0;

		const keyIdPairs = orphaned
			.map((img) => {
				const key = img.imageUrl.split("/f/")[1];
				return key ? { key, id: img.id } : null;
			})
			.filter((p): p is { key: string; id: number } => p !== null);

		const successfulIds: number[] = [];
		for (const { key, id } of keyIdPairs) {
			try {
				const result = await utapi.deleteFiles(key);
				if (!result.success) {
					console.warn(
						`[handleOrphanedProductImages] Storage delete failed for key: ${key}`,
					);
					continue;
				}
				successfulIds.push(id);
			} catch (err) {
				console.warn(
					`[handleOrphanedProductImages] Storage delete failed for key: ${key}`,
					err,
				);
			}
		}

		if (successfulIds.length > 0) {
			await db
				.delete(productImages)
				.where(inArray(productImages.id, successfulIds));
		}

		return successfulIds.length;
	} catch (error) {
		console.error("[handleOrphanedProductImages] error:", error);
		throw error;
	}
}
