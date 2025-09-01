"use server";

import { ReservationBase } from "@/app/api/reservations/definitions";
import { NewStandReservation } from "@/app/api/user_requests/actions";
import { BaseProfile } from "@/app/api/users/definitions";
import { mapErrorToMessage } from "@/app/lib/errors/errorMapper";
import { revalidatePath } from "next/cache";
import { reservationsService } from "@/app/lib/services/reservations/reservationsService";

export async function createReservationAction(
	reservation: NewStandReservation,
	price: number,
	forUser: BaseProfile,
) {
	let newReservation: ReservationBase | null = null;
	try {
		const res = await reservationsService.createReservation(
			reservation,
			price,
			forUser,
		);

		newReservation = res;
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
