"use client";

import { ReservationWithParticipantsAndUsersAndStand } from "@/app/api/reservations/definitions";
import { Avatar, AvatarImage } from "@/app/components/ui/avatar";
import {
	ActivityDetailsWithParticipants,
	FullFestival,
} from "@/app/lib/festivals/definitions";
import { useEffect, useMemo, useState } from "react";
import { Tooltip } from "react-tooltip";

type PublicFestivalActivityDetailProps = {
	festival: FullFestival;
	detail: ActivityDetailsWithParticipants;
	reservations: ReservationWithParticipantsAndUsersAndStand[];
	searchTerm: string;
};

type ParticipantCardData = {
	participantId: number;
	standLabel: string;
	participantImageUrl: string;
	participantName: string;
	standId: number;
	standNumber: number;
};

export default function PublicFestivalActivityDetail({
	searchTerm,
	detail,
	reservations,
	festival,
}: PublicFestivalActivityDetailProps) {
	const [filteredParticipants, setFilteredParticipants] = useState<
		ParticipantCardData[]
	>([]);

	/**
	 * We map the participants and reservations to the ParticipantCardData type.
	 */
	const mappedParticipants = useMemo(() => {
		const participants = detail.participants.map((participant) => {
			const reservation = reservations.find((reservation) =>
				reservation.participants.some((p) => p.userId === participant.userId),
			);
			const stand = reservation?.stand;
			const standLabel = `${stand?.label}${stand?.standNumber}`.trim();

			return {
				participantId: participant.id,
				standLabel: standLabel ? `Espacio ${standLabel}` : "Sin espacio",
				participantImageUrl: participant.user.imageUrl || "",
				participantName: participant.user.displayName || "",
				standId: stand?.id || 0,
				standNumber: stand?.standNumber || 0,
			};
		});

		// Create a lookup map to group participants by sector order
		const sectorStandMap = new Map();
		festival.festivalSectors.forEach((sector) => {
			sector.stands.forEach((stand) => {
				sectorStandMap.set(stand.id, sector.orderInFestival || 1000);
			});
		});

		const groupedParticipants = participants.reduce(
			(acc, participant) => {
				const sectorOrder = sectorStandMap.get(participant.standId) || 1000;
				if (!acc[sectorOrder]) {
					acc[sectorOrder] = [];
				}
				acc[sectorOrder].push(participant);
				return acc;
			},
			{} as Record<string, ParticipantCardData[]>,
		);

		// Sort participants within each group by stand number
		Object.values(groupedParticipants).forEach((group) => {
			group.sort((a, b) => a.standNumber - b.standNumber);
		});

		return Object.values(groupedParticipants).flat();
	}, [detail.participants, reservations, festival]);

	/**
	 * After we get the list of mapped participants, we filter them by the search term and use that list to render the participants.
	 */
	useEffect(() => {
		setFilteredParticipants(
			mappedParticipants.filter((participant) => {
				return (
					participant.participantName
						.toLowerCase()
						.includes(searchTerm.toLowerCase()) ||
					participant.standLabel
						.toLowerCase()
						.includes(searchTerm.toLowerCase())
				);
			}),
		);
	}, [mappedParticipants, searchTerm]);

	return (
		<div className="grid xxs:grid-cols-1 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
			{filteredParticipants.map((participant) => {
				return (
					<div
						key={participant.participantId}
						className="flex items-center gap-2 bg-card border border-border rounded-md p-2 shadow-sm"
					>
						<Avatar className="w-10 md:w-16 h-10 md:h-16">
							<AvatarImage
								src={participant.participantImageUrl || ""}
								alt={participant.participantName || "avatar de usuario"}
							/>
						</Avatar>
						<div className="flex flex-col gap-1 max-w-fit">
							<Tooltip
								id={`participant-${participant.participantId}`}
								content={participant.participantName}
							/>
							<h3
								data-tooltip-id={`participant-${participant.participantId}`}
								className="leading-tight text-sm md:text-base xxs:max-w-full xs:max-w-[95px] sm:max-w-full overflow-hidden text-ellipsis"
							>
								{participant.participantName}
							</h3>
							<p className="text-sm text-muted-foreground">
								{participant.standLabel}
							</p>
						</div>
					</div>
				);
			})}
		</div>
	);
}
