"use client";

import { ActivityDetailsWithParticipants } from "@/app/lib/festivals/definitions";
import ParticipantCard from "../../participant-card";
import { useCallback, useState } from "react";

type ParticipantSelectionProps = {
	participants: ActivityDetailsWithParticipants["participants"];
};
export default function ParticipantSelection({
	participants,
}: ParticipantSelectionProps) {
	const [selectedParticipants, setSelectedParticipants] = useState<number[]>(
		[],
	);

	const handleSelect = useCallback((participantId: number) => {
		setSelectedParticipants((prev) => {
			if (prev.includes(participantId)) {
				return prev.filter((id) => id !== participantId);
			}
			return [...prev, participantId];
		});
	}, []);

	return (
		<div className="flex flex-wrap justify-center md:justify-start gap-2 my-2">
			{participants.map((participant, index) => (
				<ParticipantCard
					key={participant.id}
					participant={participant}
					index={index}
					selected={selectedParticipants.includes(participant.id)}
					onSelect={() => handleSelect(participant.id)}
				/>
			))}
		</div>
	);
}
