import { ReservationWithParticipantsAndUsersAndStand } from "@/app/api/reservations/definitions";
import { UserCategory } from "@/app/api/users/definitions";
import { StandVotingItem } from "@/app/lib/festival_activites/definitions";
import {
	ActivityDetailsWithParticipants,
	FestivalActivityWithDetailsAndParticipants,
	ParticipantWithUserAndProofs,
} from "@/app/lib/festivals/definitions";

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

export function getValidParticipantsForVariant(
	variant: ActivityDetailsWithParticipants,
) {
	return variant.participants.filter(
		(participant) => participant.proofs.length > 0,
	);
}

export function mapStandsAndParticipantsToVotingItem(
	participants: ParticipantWithUserAndProofs[],
	reservations: ReservationWithParticipantsAndUsersAndStand[],
): StandVotingItem[] {
	const votingItems = participants.map((participant) => {
		const reservation = reservations.find((reservation) =>
			reservation.participants.some((p) => p.userId === participant.userId),
		);

		const stand = reservation?.stand;
		// In the best stand activity, only one image is allowed per participant so we can pick the first one.
		const standImage = participant.proofs[0]?.imageUrl;

		if (!(stand && standImage)) {
			return null;
		}

		return {
			// In the best stand activity, only one image is allowed per participant.
			standImage,
			standName: `Espacio ${stand.label}${stand.standNumber}`,
			standId: stand.id,
		};
	});

	return votingItems.filter(
		(votingItem): votingItem is StandVotingItem => votingItem !== null,
	);
}
