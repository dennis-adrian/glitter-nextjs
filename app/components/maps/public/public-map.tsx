"use client";

import { useCallback, useState } from "react";

import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import { MapElementBase } from "@/app/lib/map_elements/definitions";
import {
	computeCanvasBounds,
	getPublicStandColors,
} from "@/app/components/maps/map-utils";
import { usePublicMapCard } from "@/app/components/maps/public/public-map-card-provider";

import MapCanvas from "@/app/components/maps/map-canvas";
import MapStand from "@/app/components/maps/map-stand";
import MapElement from "@/app/components/maps/map-element";
import PublicMapLegend from "@/app/components/maps/public/public-map-legend";
import PublicMapTooltip from "@/app/components/maps/public/public-map-tooltip";

type PublicMapProps = {
	stands: StandWithReservationsWithParticipants[];
	mapElements?: MapElementBase[];
	mapBounds?: { minX: number; minY: number; width: number; height: number };
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
	const { openCard } = usePublicMapCard();
	const [hoveredStand, setHoveredStand] =
		useState<StandWithReservationsWithParticipants | null>(null);
	const [hoveredRect, setHoveredRect] = useState<DOMRect | null>(null);

	const visibleStands = stands.filter((s) => s.status !== "disabled");

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

	const handleStandSelect = useCallback(
		(stand: StandWithReservationsWithParticipants) => {
			if (!isOccupied(stand)) return;
			openCard(stand, sectorName);
		},
		[openCard, sectorName],
	);

	const canvasBounds =
		mapBounds ?? computeCanvasBounds(visibleStands, mapElements);

	return (
		<div className="flex flex-col items-center w-full">
			<div className="flex w-full max-w-[500px] items-center pb-2">
				<PublicMapLegend />
			</div>
			<div className="w-full max-w-[500px] rounded-lg border bg-background shadow-sm overflow-hidden">
				<div className="w-full">
					<MapCanvas
						config={{
							minX: canvasBounds.minX,
							minY: canvasBounds.minY,
							width: canvasBounds.width,
							height: canvasBounds.height,
						}}
					>
						{mapElements?.map((element) => (
							<MapElement key={`el-${element.id}`} element={element} />
						))}
						{visibleStands.map((stand) => (
							<MapStand
								key={stand.id}
								stand={stand}
								canBeReserved={false}
								colors={getPublicStandColors(stand.status)}
								onHoverChange={handleHoverChange}
								onTouchTap={handleStandSelect}
								onClick={handleStandSelect}
							/>
						))}
					</MapCanvas>
				</div>
			</div>
			{hoveredStand && hoveredRect && (
				<PublicMapTooltip stand={hoveredStand} anchorRect={hoveredRect} />
			)}
		</div>
	);
}
