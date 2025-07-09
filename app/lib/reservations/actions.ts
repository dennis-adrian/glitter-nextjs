"use server";

import { db } from "@/db";
import {
	collaborators,
	reservationCollaborators,
	standReservations,
	stands
} from "@/db/schema";
import { Collaborator, NewCollaborator } from "./definitions";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import {
	FullReservation,
	ReservationWithParticipantsAndUsersAndStand,
} from "@/app/api/reservations/definitions";
import { ReservationStatus } from "@/app/api/user_requests/actions";

export const addCollaborator = async (
	reservationId: number,
	collaborator: NewCollaborator | Collaborator,
) => {
	let response: {
		success: boolean;
		message: string;
	};

	try {
		response = await db.transaction(async (tx) => {
			if (collaborator.id) {
				await tx.insert(reservationCollaborators).values({
					reservationId,
					collaboratorId: collaborator.id,
				});

				return {
					success: true,
					message: "Persona agregada correctamente.",
				};
			} else {
				const [{ id: collaboratorId }] = await tx
					.insert(collaborators)
					.values({
						firstName: collaborator.firstName,
						lastName: collaborator.lastName,
						identificationNumber: collaborator.identificationNumber,
					})
					.returning({ id: collaborators.id });

				await tx.insert(reservationCollaborators).values({
					reservationId,
					collaboratorId,
				});

				return {
					success: true,
					message: "Persona agregada correctamente.",
				};
			}
		});
	} catch (error) {
		console.error(error);
		return {
			success: false,
			message: "Error al agregar persona.",
		};
	}

	revalidatePath("/my_participations");
	return response;
};

export const deleteReservationCollaborator = async (
	reservationId: number,
	collaboratorId: number,
) => {
	try {
		await db.delete(collaborators).where(eq(collaborators.id, collaboratorId));
		// TODO: this code is here to delete the reservationCollaborator record without actually
		// deleting the collaborator record. This might be useful in the future
		// if we want to keep the collaborator record for future reference.
		// await db
		//   .delete(reservationCollaborators)
		//   .where(
		//     and(
		//       eq(reservationCollaborators.reservationId, reservationId),
		//       eq(reservationCollaborators.collaboratorId, collaboratorId),
		//     ),
		//   );
	} catch (error) {
		console.error(error);
		return {
			success: false,
			message: "Error al eliminar persona.",
		};
	}

	revalidatePath("/my_participations");
	return {
		success: true,
		message: "Persona eliminada correctamente.",
	};
};

export async function fetchReservationsByFestivalId(
	festivalId: number,
): Promise<FullReservation[]> {
	try {
		return await db.query.standReservations.findMany({
			where: eq(standReservations.festivalId, festivalId),
			with: {
				stand: true,
				festival: true,
				participants: {
					with: {
						user: {
							with: {
								userSocials: true,
								profileSubcategories: {
									with: {
										subcategory: true,
									},
								},
							},
						},
					},
				},
				collaborators: {
					with: {
						collaborator: true,
					},
				},
				invoices: {
					with: {
						payments: true,
					},
				},
			},
		});
	} catch (error) {
		console.error(error);
		return [];
	}
}

/**
 * Fetches all reservations for a festival with data that can be accessed by public users or visitors.
 * @param festivalId - The ID of the festival to fetch reservations for.
 * @returns An array of reservations with stands, participants and users.
 */
export async function fetchPublicReservationsByFestivalId(
	festivalId: number,
): Promise<ReservationWithParticipantsAndUsersAndStand[]> {
	try {
		return await db.query.standReservations.findMany({
			where: eq(standReservations.festivalId, festivalId),
			with: {
				stand: true,
				participants: {
					with: {
						user: {
							with: {
								userSocials: true,
							},
						},
					},
				},
			},
		});
	} catch (error) {
		console.error(error);
		return [];
	}
}

export async function updateReservationStatus(
	data: {
		reservationId: number,
		standId: number,
		status: ReservationStatus
	}
): Promise<{ success: boolean; message: string }> {
	const { reservationId, standId, status } = data;
	try {
		await db.transaction(async (tx) => {
			await tx
				.update(standReservations)
				.set({ status })
				.where(eq(standReservations.id, reservationId));
			const standStatus = ["accepted", "verification_payment"].includes(status) ? "confirmed" : "available";
			await tx
				.update(stands)
				.set({ status: standStatus })
				.where(eq(stands.id, standId));
		});
	} catch (error) {
		console.error(error);
		return { success: false, message: "Error al actualizar la reserva" };
	}

	revalidatePath("/dashboard/reservations");
	return { success: true, message: "Reserva actualizada" };
}