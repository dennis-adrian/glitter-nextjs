"use client";

import { ReservationWithParticipantsAndUsersAndStand } from "@/app/api/reservations/definitions";
import { Avatar, AvatarImage } from "@/app/components/ui/avatar";
import { Button } from "@/app/components/ui/button";
import {
	ActivityDetailsWithParticipants,
	FullFestival,
} from "@/app/lib/festivals/definitions";
import { cn } from "@/app/lib/utils";
import { RefreshCcwIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Tooltip } from "react-tooltip";
import { toast } from "sonner";

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
	const [selectedParticipantIds, setSelectedParticipantIds] = useState<
		number[]
	>([]);
	const storageKey = `selected-public-participant-ids-activity-${detail.id}`;

	// Initialize from localStorage on mount
	useEffect(() => {
		const stored = localStorage.getItem(storageKey);
		if (stored) {
			try {
				const parsed = JSON.parse(stored);
				if (Array.isArray(parsed)) {
					setSelectedParticipantIds(parsed);
				}
			} catch (e) {
				toast.error("Error al cargar los participantes seleccionados.");
			}
		}
	}, [storageKey]);

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

	const handleParticipantClick = (participant: ParticipantCardData) => {
		const newSelection = selectedParticipantIds.includes(
			participant.participantId,
		)
			? selectedParticipantIds.filter((id) => id !== participant.participantId)
			: [...selectedParticipantIds, participant.participantId];

		// Update localStorage immediately
		localStorage.setItem(storageKey, JSON.stringify(newSelection));
		setSelectedParticipantIds(newSelection);
	};

	return (
		<div className="flex flex-col gap-2 my-3">
			<Button
				className="self-end"
				disabled={selectedParticipantIds.length === 0}
				size="sm"
				onClick={() => {
					localStorage.removeItem(storageKey);
					setSelectedParticipantIds([]);
				}}
			>
				Reiniciar
				<RefreshCcwIcon className="w-4 h-4 ml-1" />
			</Button>
			<div className="grid xxs:grid-cols-1 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
				{filteredParticipants.map((participant) => {
					return (
						<div
							key={participant.participantId}
							// className="flex items-center gap-2 bg-card border border-border rounded-md p-2 shadow-sm"
							className={cn(
								"flex items-center gap-2 bg-card border border-border rounded-md p-2 shadow-sm",
								selectedParticipantIds.includes(participant.participantId) &&
									"bg-primary/10 border-primary",
							)}
							onClick={() => handleParticipantClick(participant)}
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
		</div>
	);
}
