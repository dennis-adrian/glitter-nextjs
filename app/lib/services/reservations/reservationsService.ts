import { NewStandReservation } from "@/app/api/user_requests/actions";
import { BaseProfile } from "@/api/users/definitions";
import { reservationsRepository } from "@/lib/repositories/reservationsRepository";
import { ReservationBase } from "@/app/api/reservations/definitions";
import { ErrorCodes } from "@/app/lib/errors/codes";

async function createReservation(
	reservation: NewStandReservation,
	price: number,
	forUser: BaseProfile,
): Promise<ReservationBase> {
	if (forUser.status !== "verified") {
		throw new Error(ErrorCodes.NO_PERMISSIONS);
	}

	try {
		const blockingReservations =
			await reservationsRepository.findBlockingReservations(
				reservation.standId,
			);

		if (blockingReservations.length > 0) {
			throw new Error(ErrorCodes.RESERVATION_ALREADY_EXISTS);
		}

		const mockNewReservation = { id: "hello" } as unknown as ReservationBase;
		return mockNewReservation;
	} catch (error) {
		throw error;
	}
}

export const reservationsService = {
	createReservation,
};
