"use client";

import { useState } from "react";

import { ProfileType } from "@/app/api/users/definitions";
import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import { FestivalBase } from "@/app/lib/festivals/definitions";
import { MapElementBase } from "@/app/lib/map_elements/definitions";
import UserMap from "@/app/components/maps/user/user-map";
import { StandInfoCard } from "@/app/components/festivals/reservations/stand-info-card";

export default function ClientMap({
	festival,
	profile,
	sectorName,
	stands,
	mapElements,
	mapBounds,
}: {
	festival: FestivalBase;
	profile: ProfileType | null;
	sectorName?: string;
	stands: StandWithReservationsWithParticipants[];
	mapElements?: MapElementBase[];
	mapBounds?: { minX: number; minY: number; width: number; height: number };
}) {
	const [selectedStand, setSelectedStand] =
		useState<StandWithReservationsWithParticipants | null>(null);

	function handleStandSelect(stand: StandWithReservationsWithParticipants) {
		setSelectedStand(stand);
	}

	return (
		<>
			<UserMap
				stands={stands}
				mapElements={mapElements}
				mapBounds={mapBounds}
				profile={profile}
				onStandClick={handleStandSelect}
				onStandTouchTap={handleStandSelect}
			/>
			{selectedStand != null && profile != null && sectorName != null && (
				<StandInfoCard
					stand={selectedStand}
					sectorName={sectorName}
					profile={profile}
					festival={festival}
					onClose={() => setSelectedStand(null)}
				/>
			)}
		</>
	);
}
