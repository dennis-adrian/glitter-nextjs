"use client";

import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";

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

	// Tracks whether openCard was just called during the current pointer event,
	// so the outside-tap listener knows to skip closing the card.
	const justOpenedRef = useRef(false);
	// Ref attached to the card element to detect clicks inside the card.
	const cardRef = useRef<HTMLDivElement | null>(null);

	const openCard = useCallback(
		(stand: StandWithReservationsWithParticipants, sectorName?: string) => {
			justOpenedRef.current = true;
			setSelectedStand(stand);
			setCardSectorName(sectorName);
			setCardOpen(true);
			// Reset flag after current event loop so the pointerup listener can close
			// on future outside taps.
			setTimeout(() => {
				justOpenedRef.current = false;
			}, 0);
		},
		[],
	);

	const closeCard = useCallback(() => {
		setCardOpen(false);
	}, []);

	// Close the card when the user taps/clicks outside of it or presses Escape.
	useEffect(() => {
		if (!cardOpen) return;

		const handlePointerUp = (e: PointerEvent) => {
			if (justOpenedRef.current) return; // stand was just tapped
			if (cardRef.current?.contains(e.target as Node)) return; // inside card
			setCardOpen(false);
		};

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") setCardOpen(false);
		};

		document.addEventListener("pointerup", handlePointerUp);
		document.addEventListener("keydown", handleKeyDown);

		return () => {
			document.removeEventListener("pointerup", handlePointerUp);
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [cardOpen]);

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
				cardRef={cardRef}
			/>
		</PublicMapCardContext.Provider>
	);
}
