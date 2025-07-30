"use server";

import {
	NewParticipantProduct,
	ParticipantProduct,
} from "@/app/lib/participant_products/definitions";
import { deleteFile } from "@/app/lib/uploadthing/actions";
import { utapi } from "@/app/server/uploadthing";
import { db } from "@/db";
import {
	participantProducts,
	reservationParticipants,
	standReservations,
	festivals,
} from "@/db/schema";
import { and, eq, getTableColumns } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function createParticipantProduct(
	newParticipantProduct: NewParticipantProduct,
) {
	try {
		await db.insert(participantProducts).values({
			...newParticipantProduct,
		});
	} catch (error) {
		console.error("Error creating participant product", error);
		return {
			success: false,
			message: "Error al agregar el producto",
		};
	}

	revalidatePath("/my_participations/submit_products");
	return {
		success: true,
		message: "Producto agregado correctamente",
	};
}

export async function fetchParticipantProducts(
	profileId: number,
	festivalId: number,
): Promise<ParticipantProduct[]> {
	try {
		const participantProductsColumns = getTableColumns(participantProducts);
		return await db
			.select(participantProductsColumns)
			.from(participantProducts)
			.leftJoin(
				reservationParticipants,
				eq(participantProducts.participationId, reservationParticipants.id),
			)
			.leftJoin(
				standReservations,
				eq(reservationParticipants.reservationId, standReservations.id),
			)
			.leftJoin(festivals, eq(standReservations.festivalId, festivals.id))
			.where(
				and(
					eq(participantProducts.userId, profileId),
					eq(standReservations.festivalId, festivalId),
				),
			);
	} catch (error) {
		console.error("Error fetching participant products", error);
		return [];
	}
}

export async function deleteParticipantProduct(product: ParticipantProduct) {
	try {
		await db.transaction(async (tx) => {
			await tx
				.delete(participantProducts)
				.where(eq(participantProducts.id, product.id));

			const imageDeleted = await deleteFile(product.imageUrl);
			if (!imageDeleted.success) {
				throw new Error(imageDeleted.error);
			}
		});
	} catch (error) {
		console.error("Error deleting participant product", error);
		return {
			success: false,
			message: "Error al eliminar el producto",
		};
	}

	revalidatePath("/my_participations/submit_products");
	return { success: true, message: "Producto eliminado correctamente" };
}
