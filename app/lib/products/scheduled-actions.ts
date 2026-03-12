"use server";

import { db } from "@/db";
import { productImages } from "@/db/schema";
import { utapi } from "@/app/server/uploadthing";
import { and, eq, inArray, lt, sql } from "drizzle-orm";

export async function handleOrphanedProductImages(): Promise<number> {
	try {
		const orphaned = await db
			.select({ id: productImages.id, imageUrl: productImages.imageUrl })
			.from(productImages)
			.where(
				and(
					eq(productImages.uploadStatus, "pending"),
					lt(productImages.createdAt, sql`now() - interval '24 hours'`),
				),
			);

		if (orphaned.length === 0) return 0;

		const keys = orphaned
			.map((img) => img.imageUrl.split("/f/")[1])
			.filter(Boolean) as string[];

		if (keys.length > 0) {
			await utapi.deleteFiles(keys);
		}

		await db.delete(productImages).where(
			inArray(
				productImages.id,
				orphaned.map((img) => img.id),
			),
		);

		return orphaned.length;
	} catch (error) {
		console.error("[handleOrphanedProductImages] error:", error);
		throw error;
	}
}
