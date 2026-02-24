"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ProfileType } from "@/app/api/users/definitions";
import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import { FestivalBase } from "@/app/lib/festivals/definitions";
import { MapElementBase } from "@/app/lib/map_elements/definitions";
import UserMap from "@/app/components/maps/user/user-map";
import { StandInfoCard } from "@/app/components/festivals/reservations/stand-info-card";
import { useStandPolling } from "@/app/hooks/use-stand-polling";
import { getActiveHold } from "@/app/lib/stands/hold-actions";

type ActiveHold = { id: number; standId: number } | null;

export default function ClientMap({
	festival,
	profile,
	sectorId,
	sectorName,
	stands: initialStands,
	mapElements,
	mapBounds,
	activeHold: initialActiveHold,
	subcategoryIds = [],
	onStandsChange,
}: {
	festival: FestivalBase;
	profile: ProfileType | null;
	sectorId?: number;
	sectorName?: string;
	stands: StandWithReservationsWithParticipants[];
	mapElements?: MapElementBase[];
	mapBounds?: { minX: number; minY: number; width: number; height: number };
	activeHold?: ActiveHold;
	subcategoryIds?: number[];
	onStandsChange?: (stands: StandWithReservationsWithParticipants[]) => void;
}) {
	const [stands, setStands] = useState(initialStands);
	const onStandsChangeRef = useRef(onStandsChange);

	useEffect(() => {
		onStandsChangeRef.current = onStandsChange;
	}, [onStandsChange]);

	useEffect(() => {
		onStandsChangeRef.current?.(stands);
	}, [stands]);
	const [selectedStandId, setSelectedStandId] = useState<number | null>(null);
	const selectedStand =
		selectedStandId != null
			? (stands.find((s) => s.id === selectedStandId) ?? null)
			: null;
	const [activeHold, setActiveHold] = useState<ActiveHold>(
		initialActiveHold ?? null,
	);

	const handleHoldChange = useCallback((hold: ActiveHold) => {
		setActiveHold(hold);
	}, []);

	// Fetch latest active hold on mount to handle stale server cache
	useEffect(() => {
		if (!profile) return;
		let cancelled = false;
		getActiveHold(profile.id, festival.id)
			.then((hold) => {
				if (!cancelled) setActiveHold(hold);
			})
			.catch((error) => {
				console.error("Error fetching active hold", error);
			});

		return () => {
			cancelled = true;
		};
	}, [profile, festival.id]);

	// Poll for stand status changes every 4 seconds
	useStandPolling(sectorId ?? null, 4000, (polledStands) => {
		setStands((prev) => {
			let changed = false;
			const updated = prev.map((s) => {
				const polled = polledStands.find((p) => p.id === s.id);
				if (polled && polled.status !== s.status) {
					changed = true;
					return {
						...s,
						status:
							polled.status as StandWithReservationsWithParticipants["status"],
					};
				}
				return s;
			});
			return changed ? updated : prev;
		});
	});

	const handleStandSelect = useCallback(
		(stand: StandWithReservationsWithParticipants) => {
			setSelectedStandId(stand.id);
		},
		[],
	);

	return (
		<>
			<UserMap
				stands={stands}
				mapElements={mapElements}
				mapBounds={mapBounds}
				profile={profile}
				selectedStandId={selectedStandId}
				subcategoryIds={subcategoryIds}
				onStandClick={handleStandSelect}
				onStandTouchTap={handleStandSelect}
			/>
			{selectedStand != null && profile != null && sectorName != null && (
				<StandInfoCard
					key={selectedStand.id}
					stand={selectedStand}
					sectorName={sectorName}
					profile={profile}
					festival={festival}
					activeHold={activeHold}
					onHoldChange={handleHoldChange}
					onClose={() => setSelectedStandId(null)}
				/>
			)}
		</>
	);
}
