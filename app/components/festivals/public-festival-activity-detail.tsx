"use client";

import { ReservationWithParticipantsAndUsersAndStand } from "@/app/api/reservations/definitions";
import { Avatar, AvatarImage } from "@/app/components/ui/avatar";
import { ActivityDetailsWithParticipants } from "@/app/lib/festivals/definitions";
import { useMemo } from "react";

type PublicFestivalActivityDetailProps = {
	detail: ActivityDetailsWithParticipants;
	reservations: ReservationWithParticipantsAndUsersAndStand[];
};

type ParticipantCardData = {
	participantId: number;
	standLabel: string;
	participantImageUrl: string;
	participantName: string;
};

export default function PublicFestivalActivityDetail({
	detail,
	reservations,
}: PublicFestivalActivityDetailProps) {
	const participantCardData = useMemo(
		(): ParticipantCardData[] =>
			detail.participants.map((participant) => {
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
				};
			}),
		[detail.participants, reservations],
	);

	return (
		<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
			{participantCardData.map((participant) => {
				return (
					<div
						key={participant.participantId}
						className="flex items-center gap-2 bg-card border border-border rounded-md p-2 shadow-sm"
					>
						<Avatar className="w-12 h-12">
							<AvatarImage
								src={participant.participantImageUrl || ""}
								alt={participant.participantName || "avatar de usuario"}
							/>
						</Avatar>
						<div>
							<h3>{participant.participantName}</h3>
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
