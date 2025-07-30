"use server";

import {
	NewParticipantProduct,
	ParticipantProduct,
} from "@/app/lib/participant_products/definitions";
import { groupProductsByStatus } from "@/app/lib/participant_products/utils";
import { deleteFile } from "@/app/lib/uploadthing/actions";
import { utapi } from "@/app/server/uploadthing";
import { db } from "@/db";
import {
	participantProducts,
	reservationParticipants,
	standReservations,
	festivals,
} from "@/db/schema";
import { and, desc, eq, getTableColumns } from "drizzle-orm";
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
		const productsRes = await db
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
			)
			.orderBy(desc(participantProducts.createdAt));

		const groupedProducts = groupProductsByStatus(productsRes);

		return Object.values(groupedProducts).flat();
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

export async function fetchParticipantProductsByParticipationId(
	profileId: number,
	participationId: number,
): Promise<ParticipantProduct[]> {
	try {
		return db.query.participantProducts.findMany({
			where: and(
				eq(participantProducts.participationId, participationId),
				eq(participantProducts.userId, profileId),
			),
			orderBy: desc(participantProducts.createdAt),
		});
	} catch (error) {
		console.error(
			"Error fetching participant products by participation id",
			error,
		);
		return [];
	}
}
