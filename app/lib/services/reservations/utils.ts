import { FestivalBase } from "@/lib/festivals/definitions";
import { UserSanctionBase } from "@/lib/users/definitions";
import { DateTime } from "luxon";

export const validateUserSanctions = <T extends UserSanctionBase>(
	userSanctions: T[],
	festival: FestivalBase,
): T[] => {
	const validatedSanctions: T[] = [];
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

			const currentDate = DateTime.now();
			const delayEndDate = DateTime.fromJSDate(
				festival.reservationsStartDate,
			).plus({
				[delayUnit]: delay,
			});

			if (delayEndDate.diff(currentDate).toMillis() <= 0) continue;

			validatedSanctions.push(sanction);
		} else {
			validatedSanctions.push(sanction);
		}
	}
	return validatedSanctions;
};
