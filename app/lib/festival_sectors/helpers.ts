import { BaseProfile, UserCategory } from "@/app/api/users/definitions";
import { FestivalActivityWithDetailsAndParticipants } from "@/app/lib/festivals/definitions";
import { FestivalSectorWithStands } from "@/app/lib/festival_sectors/definitions";
import { ActivityDetailsWithParticipants } from "@/app/lib/festivals/definitions";

export function getFestivalSectorAllowedCategories(
	sector: FestivalSectorWithStands,
	allCategories?: boolean,
): UserCategory[] {
	const categories = [
		...new Set(sector.stands.map((stand) => stand.standCategory)),
	];

	if (allCategories) return categories;

	return categories.filter((category) => category !== "new_artist");
}

export function isProfileEnrolledInActivity(
	profileId: number,
	activity: FestivalActivityWithDetailsAndParticipants,
) {
	return activity.details.some((detail) =>
		detail.participants.some((participant) => participant.userId === profileId),
	);
}

export function isActivityDetailFull(detail: ActivityDetailsWithParticipants) {
	return (
		detail.participationLimit &&
		detail.participationLimit > 0 &&
		detail.participants.length >= detail.participationLimit
	);
}
