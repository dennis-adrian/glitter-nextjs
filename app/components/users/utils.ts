import { Participation } from "@/app/api/users/definitions";

export type GroupedParticipationsByFestival = {
	festivalId: number;
	festivalName: string;
	reservationsCount: number;
	stands: string[];
	statuses: Participation["reservation"]["status"][];
};

export function getGroupedParticipationsByFestival(
	participations: Participation[],
): GroupedParticipationsByFestival[] {
	const groupedParticipationsByFestival = Array.from(
		(participations || [])
			.reduce<
				Map<
					number,
					{
						festivalId: number;
						festivalName: string;
						reservationsCount: number;
						stands: Set<string>;
						statuses: Set<Participation["reservation"]["status"]>;
					}
				>
			>((acc, participation) => {
				const festivalId =
					participation?.reservation?.festivalId ??
					participation?.reservation?.festival?.id;

				if (festivalId == null) {
					return acc;
				}

				const festivalName =
					participation?.reservation?.festival?.name ??
					`Festival ${festivalId}`;
				const stand = participation.reservation?.stand;
				const standNumber = stand?.standNumber;
				const standLabel = stand?.label
					? stand.label + (standNumber ?? "")
					: undefined;
				const reservationStatus = participation.reservation?.status;
				const currentFestival = acc.get(festivalId);

				if (!currentFestival) {
					acc.set(festivalId, {
						festivalId,
						festivalName,
						reservationsCount: 1,
						stands: standLabel ? new Set([standLabel]) : new Set(),
						statuses: new Set([reservationStatus].filter(Boolean)),
					});
					return acc;
				}

				currentFestival.reservationsCount += 1;
				if (standLabel) {
					currentFestival.stands.add(standLabel);
				}
				if (reservationStatus != null) {
					currentFestival.statuses.add(reservationStatus);
				}

				return acc;
			}, new Map())
			.values(),
	).map((festival) => ({
		...festival,
		stands: Array.from(festival.stands),
		statuses: Array.from(festival.statuses),
	}));

	return groupedParticipationsByFestival;
}
