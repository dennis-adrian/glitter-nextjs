"use server";

import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { db } from "@/db";
import { productImages } from "@/db/schema";
import { utapi } from "@/app/server/uploadthing";
import { eq } from "drizzle-orm";

export async function deleteProductImage(
	imageId: number,
): Promise<{ success: boolean; message: string }> {
	const currentProfile = await getCurrentUserProfile();
	if (!currentProfile || currentProfile.role !== "admin") {
		return {
			success: false,
			message: "No tienes permisos para realizar esta acción.",
		};
	}

	const image = await db.query.productImages.findFirst({
		where: (t, { eq }) => eq(t.id, imageId),
	});

	if (!image) {
		return { success: false, message: "Imagen no encontrada." };
	}

	try {
		const key = image.imageUrl.split("/f/")[1];
		let storageDeleted = true;
		if (!key) {
			console.warn(
				`[deleteProductImage] Could not extract storage key from URL: ${image.imageUrl}`,
			);
			storageDeleted = false;
		} else {
			const result = await utapi.deleteFiles(key);
			if (!result.success) {
				console.warn(
					`[deleteProductImage] Storage delete failed for key: ${key}`,
				);
				storageDeleted = false;
			}
		}
		if (!storageDeleted) {
			return {
				success: false,
				message: "No se pudo eliminar la imagen. Intenta de nuevo.",
			};
		}
		try {
			await db.delete(productImages).where(eq(productImages.id, imageId));
			return { success: true, message: "Imagen eliminada correctamente." };
		} catch (dbError) {
			console.error(
				`[deleteProductImage] Storage deleted but DB deletion failed for imageId: ${imageId}`,
				dbError,
			);
			// Storage already deleted - return success but log for monitoring
			return { success: true, message: "Imagen eliminada correctamente." };
		}
	} catch (error) {
		console.error(error);
		return { success: false, message: "No se pudo eliminar la imagen." };
	}
}
