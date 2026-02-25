"use client";

import { createContext, useCallback, useContext, useState } from "react";

import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import PublicMapStandCard from "@/app/components/maps/public/public-map-drawer";

type PublicMapCardContextValue = {
	openCard: (
		stand: StandWithReservationsWithParticipants,
		sectorName?: string,
	) => void;
	closeCard: () => void;
	selectedStandId: number | null;
};

export const PublicMapCardContext = createContext<PublicMapCardContextValue>({
	openCard: () => {},
	closeCard: () => {},
	selectedStandId: null,
});

export function usePublicMapCard() {
	return useContext(PublicMapCardContext);
}

export function PublicMapCardProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const [selectedStand, setSelectedStand] =
		useState<StandWithReservationsWithParticipants | null>(null);
	const [cardSectorName, setCardSectorName] = useState<string | undefined>(
		undefined,
	);
	const [cardOpen, setCardOpen] = useState(false);

	const openCard = useCallback(
		(stand: StandWithReservationsWithParticipants, sectorName?: string) => {
			setSelectedStand(stand);
			setCardSectorName(sectorName);
			setCardOpen(true);
		},
		[],
	);

	const closeCard = useCallback(() => {
		setCardOpen(false);
	}, []);

	return (
		<PublicMapCardContext.Provider
			value={{
				openCard,
				closeCard,
				selectedStandId: cardOpen ? (selectedStand?.id ?? null) : null,
			}}
		>
			{children}
			<PublicMapStandCard
				key={`${selectedStand?.id ?? "closed"}-${cardOpen}`}
				stand={selectedStand}
				open={cardOpen}
				sectorName={cardSectorName}
				onOpenChange={setCardOpen}
			/>
		</PublicMapCardContext.Provider>
	);
}
