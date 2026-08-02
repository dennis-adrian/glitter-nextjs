"use client";

import { useCallback, useMemo, useState } from "react";

import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import { MapElementBase } from "@/app/lib/map_elements/definitions";
import { MapBounds } from "@/app/components/maps/map-types";
import {
	indexJointGroupsByStandId,
	resolveJointGroups,
} from "@/app/lib/stands/groups";
import {
	getExternalParticipantStandColors,
	getPublicStandColors,
} from "@/app/components/maps/map-utils";
import { usePublicMapCard } from "@/app/components/maps/public/public-map-card-provider";
import { hasExternalParticipants } from "@/app/components/maps/map-participants";

import MapSurface from "@/app/components/maps/map-surface";
import PublicMapLegend from "@/app/components/maps/public/public-map-legend";
import PublicMapTooltip from "@/app/components/maps/public/public-map-tooltip";

type PublicMapProps = {
	stands: StandWithReservationsWithParticipants[];
	mapElements?: MapElementBase[];
	mapBounds?: MapBounds;
	sectorName?: string;
};

function isOccupied(stand: StandWithReservationsWithParticipants): boolean {
	return stand.status === "reserved" || stand.status === "confirmed";
}

export default function PublicMap({
	stands,
	mapElements,
	mapBounds,
	sectorName,
}: PublicMapProps) {
	const { openCard, selectedStandId } = usePublicMapCard();
	const [hoveredStand, setHoveredStand] =
		useState<StandWithReservationsWithParticipants | null>(null);
	const [hoveredRect, setHoveredRect] = useState<DOMRect | null>(null);

	const visibleStands = useMemo(
		() => stands.filter((s) => s.status !== "disabled"),
		[stands],
	);

	const handleHoverChange = useCallback(
		(
			stand: StandWithReservationsWithParticipants | null,
			rect: DOMRect | null,
		) => {
			if (stand && !isOccupied(stand)) return;
			setHoveredStand(stand);
			setHoveredRect(rect);
		},
		[],
	);

	const jointGroupByStandId = useMemo(
		() => indexJointGroupsByStandId(resolveJointGroups(visibleStands)),
		[visibleStands],
	);

	const handleStandSelect = useCallback(
		(stand: StandWithReservationsWithParticipants) => {
			if (!isOccupied(stand)) return;
			openCard(stand, sectorName, jointGroupByStandId.get(stand.id)?.stands);
		},
		[openCard, sectorName, jointGroupByStandId],
	);

	return (
		<div className="flex flex-col items-center w-full">
			<div className="flex w-full max-w-125 items-center pb-2">
				<PublicMapLegend />
			</div>
			<div className="w-full max-w-125 rounded-lg border bg-background shadow-sm overflow-hidden">
				<div className="w-full">
					<MapSurface
						stands={visibleStands}
						mapElements={mapElements}
						mapBounds={mapBounds}
						selectedStandId={selectedStandId}
						getColors={(stand) =>
							hasExternalParticipants(stand)
								? getExternalParticipantStandColors()
								: getPublicStandColors(stand.status)
						}
						onStandClick={handleStandSelect}
						onStandTouchTap={handleStandSelect}
						onStandHoverChange={handleHoverChange}
					/>
				</div>
			</div>
			{hoveredStand && hoveredRect && (
				<PublicMapTooltip stand={hoveredStand} anchorRect={hoveredRect} />
			)}
		</div>
	);
}
