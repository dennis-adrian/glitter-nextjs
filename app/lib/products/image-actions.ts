"use server";

import { db } from "@/db";
import { productImages } from "@/db/schema";
import { utapi } from "@/app/server/uploadthing";
import { eq } from "drizzle-orm";

export async function deleteProductImage(
	imageId: number,
): Promise<{ success: boolean; message: string }> {
	const image = await db.query.productImages.findFirst({
		where: (t, { eq }) => eq(t.id, imageId),
	});

	if (!image) {
		return { success: false, message: "Imagen no encontrada." };
	}

	try {
		const key = image.imageUrl.split("/f/")[1];
		if (key) {
			const result = await utapi.deleteFiles(key);
			if (!result.success) {
				console.warn(
					`[deleteProductImage] Storage delete failed for key: ${key}`,
				);
			}
		}
		await db.delete(productImages).where(eq(productImages.id, imageId));
		return { success: true, message: "Imagen eliminada correctamente." };
	} catch (error) {
		console.error(error);
		return { success: false, message: "No se pudo eliminar la imagen." };
	}
}
