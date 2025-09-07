"use server";

import { ReservationBase } from "@/api/reservations/definitions";
import { StandBase } from "@/api/stands/definitions";
import { BaseProfile } from "@/api/users/definitions";
import { fetchAdminUsers } from "@/app/api/users/actions";
import ReservationCreatedEmailTemplate from "@/app/emails/reservation-created";
import { getCategoryOccupationLabel } from "@/app/lib/maps/helpers";
import {
	create,
	findBlockingReservations,
} from "@/app/lib/repositories/reservations/reservationsRepository";
import { validateUserSanctions } from "@/app/lib/services/reservations/utils";
import { sendEmail } from "@/app/vendors/resend";
import { ErrorCodes } from "@/lib/errors/codes";
import { FestivalBase } from "@/lib/festivals/definitions";
import { findActiveUserSanctions } from "@/lib/repositories/usersRepository";

export async function createReservation(
	forUser: BaseProfile,
	stand: StandBase,
	festival: FestivalBase,
	participantIds: number[],
): Promise<ReservationBase> {
	if (forUser.status !== "verified") {
		throw new Error(ErrorCodes.NO_PERMISSIONS);
	}

	const userSanctions = await findActiveUserSanctions(forUser.id);

	if (
		userSanctions.length > 0 &&
		validateUserSanctions(userSanctions, festival).length > 0
	) {
		throw new Error(ErrorCodes.USER_HAS_SANCTIONS);
	}

	try {
		const blockingReservations = await findBlockingReservations(stand.id);

		if (blockingReservations.length > 0) {
			throw new Error(ErrorCodes.RESERVATION_ALREADY_EXISTS);
		}

		const newReservation = await create(
			{
				standId: stand.id,
				festivalId: festival.id,
				participantIds,
			},
			stand.price,
		);

		const admins = await fetchAdminUsers();
		const adminEmails = admins.map((admin) => admin.email);
		await sendEmail({
			to: [...adminEmails],
			from: "Reservas Glitter <reservas@productoraglitter.com>",
			subject: `Reserva para ${festival.name} creada en el stand ${stand.label}${stand.standNumber}`,
			react: ReservationCreatedEmailTemplate({
				festivalName: festival.name,
				reservation: newReservation,
				creatorName: forUser.displayName || "Usuario",
				standName: `${stand.label}${stand.standNumber}`,
				standCategory: getCategoryOccupationLabel(stand.standCategory, {
					singular: false,
				}),
			}) as React.ReactElement,
		});

		return newReservation;
	} catch (error) {
		throw error;
	}
}
