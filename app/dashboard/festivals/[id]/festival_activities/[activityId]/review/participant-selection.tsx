"use client";

import { ActivityDetailsWithParticipants } from "@/app/lib/festivals/definitions";
import { useCallback, useEffect, useState } from "react";
import ParticipantCard from "../../participant-card";

type ParticipantSelectionProps = {
	participants: ActivityDetailsWithParticipants["participants"];
};
export default function ParticipantSelection({
	participants,
}: ParticipantSelectionProps) {
	const [selectedParticipants, setSelectedParticipants] = useState<number[]>(
		[],
	);
	const storageKey = `selected-participants-${participants[0]?.detailsId || "default"}`;

	// Initialize from localStorage on mount
	useEffect(() => {
		const stored = localStorage.getItem(storageKey);
		if (stored) {
			try {
				const parsed = JSON.parse(stored);
				if (Array.isArray(parsed)) {
					setSelectedParticipants(parsed);
				}
			} catch (e) {
				console.error(
					"Failed to parse selected participants from localStorage",
				);
			}
		}
	}, [storageKey]);

	const handleSelect = useCallback(
		(participantId: number) => {
			setSelectedParticipants((prev) => {
				const newSelection = prev.includes(participantId)
					? prev.filter((id) => id !== participantId)
					: [...prev, participantId];

				// Update localStorage immediately
				localStorage.setItem(storageKey, JSON.stringify(newSelection));
				return newSelection;
			});
		},
		[storageKey],
	);

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
