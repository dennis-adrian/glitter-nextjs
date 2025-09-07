"use server";

import { ReservationBase } from "@/api/reservations/definitions";
import { BaseProfile } from "@/api/users/definitions";
import { mapErrorToMessage } from "@/lib/errors/errorMapper";
import { revalidatePath } from "next/cache";
import { createReservation } from "@/lib/services/reservations/reservationsService";
import { StandBase } from "@/app/api/stands/definitions";
import { FestivalBase } from "@/app/lib/festivals/definitions";

export async function createReservationAction(
	forUser: BaseProfile,
	stand: StandBase,
	festival: FestivalBase,
	participantIds: number[],
) {
	let newReservation: ReservationBase | null = null;

	try {
		newReservation = await createReservation(
			forUser,
			stand,
			festival,
			participantIds,
		);
	} catch (e) {
		console.error("Error creating reservation", e);
		const errorCode = e as Error;
		const message = mapErrorToMessage(
			errorCode.message,
			"Ups! No pudimos crear la reserva",
		);

		return { success: false, message };
	}

	revalidatePath("profiles");
	revalidatePath("/my_profile");

	return {
		success: true,
		message: "Reserva creada",
		reservationId: newReservation.id,
	};
}
