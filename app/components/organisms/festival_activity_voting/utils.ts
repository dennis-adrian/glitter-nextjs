import { UserCategory } from "@/app/api/users/definitions";
import { FestivalActivityWithDetailsAndParticipants } from "@/app/lib/festivals/definitions";

export function getValidParticipantsByCategory(
	activity: FestivalActivityWithDetailsAndParticipants,
	category: UserCategory,
) {
	const categoryParticipants = activity.details
		.filter(
			(variant) =>
				variant.category === category && variant.participants.length > 0,
		)
		.flatMap((variant) => variant.participants);

	return categoryParticipants.filter(
		(participant) => participant.proofs.length > 0,
	);
}
