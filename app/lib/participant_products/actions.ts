"use server";

import { NewParticipantProduct } from "@/app/lib/participant_products/definitions";
import { utapi } from "@/app/server/uploadthing";
import { db } from "@/db";
import { participantProducts } from "@/db/schema";
import { revalidatePath } from "next/cache";

export async function createParticipantProduct(
	newParticipantProduct: Omit<NewParticipantProduct, "imageUrl">,
	image: File,
) {
	try {
		const uploadedImageResult = await utapi.uploadFiles(image);
		if (uploadedImageResult.error) {
			throw new Error(uploadedImageResult.error.message);
		}

		const uploadedImage = uploadedImageResult.data;
		await db.insert(participantProducts).values({
			...newParticipantProduct,
			imageUrl: uploadedImage.url,
		});
	} catch (error) {
		console.error("Error creating participant product", error);
		return {
			success: false,
			message: "Error al agregar el producto",
		};
	}

	revalidatePath("my_participations/submit_products");
	return {
		success: true,
		message: "Producto agregado correctamente",
	};
}
