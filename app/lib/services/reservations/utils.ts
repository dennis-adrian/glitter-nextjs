import { FestivalBase } from "@/lib/festivals/definitions";
import { UserSanctionBase } from "@/lib/users/definitions";
import { DateTime } from "luxon";

export const validateUserSanctions = (
	userSanctions: UserSanctionBase[],
	festival: FestivalBase,
): UserSanctionBase[] => {
	const validatedSanctions: UserSanctionBase[] = [];
	for (const sanction of userSanctions) {
		if (!sanction.active) continue;

		if (sanction.type === "reservation_delay") {
			const delay = sanction.duration;
			const delayUnit = sanction.durationUnit;

			if (
				!delay ||
				!delayUnit ||
				["festivals", "indefinitely"].includes(delayUnit)
			)
				continue;

			const reservationDate = DateTime.fromJSDate(
				festival.reservationsStartDate,
			);
			const currentDate = DateTime.now();
			const delayEndDate = DateTime.fromJSDate(
				festival.reservationsStartDate,
			).plus({
				[delayUnit]: delay,
			});

			console.log("reservationDate", reservationDate);
			console.log("currentDate", currentDate);
			console.log("delayEndDate", delayEndDate);
			console.log("delay", delay);
			console.log("delayUnit", delayUnit);

			if (delayEndDate.diff(currentDate).toMillis() > 0) {
				console.log("sanction is active");
				validatedSanctions.push(sanction);
			} else {
				console.log("sanction is not active");
			}
		} else {
			validatedSanctions.push(sanction);
		}
	}
	return validatedSanctions;
};
