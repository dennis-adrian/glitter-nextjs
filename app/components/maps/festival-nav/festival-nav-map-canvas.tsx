"use client";

import { useCallback } from "react";
import { TransformComponent } from "react-zoom-pan-pinch";
import { MapPin } from "lucide-react";

import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import { MapElementBase } from "@/app/lib/map_elements/definitions";
import {
	STAND_SIZE,
	StandColors,
	computeCanvasBounds,
	getPublicStandColors,
	getStandPosition,
} from "@/app/components/maps/map-utils";
import MapCanvas from "@/app/components/maps/map-canvas";
import MapStand from "@/app/components/maps/map-stand";
import MapElement from "@/app/components/maps/map-element";
import MapTransformWrapper from "@/app/components/maps/map-transform-wrapper";

type FestivalNavMapCanvasProps = {
	stands: StandWithReservationsWithParticipants[];
	mapElements: MapElementBase[];
	mapBounds?: { minX: number; minY: number; width: number; height: number };
	selectedStandId: number | null;
	couponBookUserIdSet: Set<number>;
	sectorName: string;
	onStandSelect: (
		stand: StandWithReservationsWithParticipants,
		sectorName: string,
	) => void;
};

function isOccupied(stand: StandWithReservationsWithParticipants): boolean {
	return stand.status === "reserved" || stand.status === "confirmed";
}

function getStandParticipantUserIds(
	stand: StandWithReservationsWithParticipants,
): number[] {
	return stand.reservations
		.filter((r) => r.status !== "rejected")
		.flatMap((r) => r.participants)
		.map((p) => p.user.id);
}

function hasCouponParticipant(
	stand: StandWithReservationsWithParticipants,
	couponBookUserIdSet: Set<number>,
): boolean {
	return getStandParticipantUserIds(stand).some((id) =>
		couponBookUserIdSet.has(id),
	);
}

function getNavStandColors(
	stand: StandWithReservationsWithParticipants,
	couponBookUserIdSet: Set<number>,
): StandColors {
	if (isOccupied(stand) && hasCouponParticipant(stand, couponBookUserIdSet)) {
		return {
			fill: "rgba(217, 119, 6, 0.85)",
			hoverFill: "rgba(180, 83, 9, 0.95)",
			stroke: "rgba(146, 64, 14, 0.9)",
			text: "#ffffff",
		};
	}
	return getPublicStandColors(stand.status);
}

export default function FestivalNavMapCanvas({
	stands,
	mapElements,
	mapBounds,
	selectedStandId,
	couponBookUserIdSet,
	sectorName,
	onStandSelect,
}: FestivalNavMapCanvasProps) {
	const visibleStands = stands.filter((s) => s.status !== "disabled");
	const canvasBounds =
		mapBounds ?? computeCanvasBounds(visibleStands, mapElements);

	const handleStandSelect = useCallback(
		(stand: StandWithReservationsWithParticipants) => {
			if (!isOccupied(stand)) return;
			onStandSelect(stand, sectorName);
		},
		[onStandSelect, sectorName],
	);

	const couponStands = visibleStands.filter(
		(s) => isOccupied(s) && hasCouponParticipant(s, couponBookUserIdSet),
	);

	const canvasConfig = {
		minX: canvasBounds.minX,
		minY: canvasBounds.minY,
		width: canvasBounds.width,
		height: canvasBounds.height,
	};

	return (
		<div className="relative w-full border rounded-lg overflow-hidden">
			<MapTransformWrapper initialScale={1} minScale={1} maxScale={4} centerOnInit>
				<TransformComponent wrapperStyle={{ width: "100%" }} contentStyle={{ width: "100%" }}>
					<MapCanvas config={canvasConfig}>
						{mapElements.map((element) => (
							<MapElement key={`el-${element.id}`} element={element} />
						))}
						{visibleStands.map((stand) => (
							<MapStand
								key={stand.id}
								stand={stand}
								canBeReserved={false}
								selected={stand.id === selectedStandId}
								colors={getNavStandColors(stand, couponBookUserIdSet)}
								onTouchTap={handleStandSelect}
								onClick={handleStandSelect}
							/>
						))}
						{/* Coupon badge overlay — painted after stands */}
						<g aria-hidden="true">
							{couponStands.map((stand) => {
								const { left, top } = getStandPosition(stand);
								return (
									<g
										key={`badge-${stand.id}`}
										transform={`translate(${left}, ${top})`}
										style={{ pointerEvents: "none" }}
									>
										<circle
											cx={STAND_SIZE - 0.8}
											cy={0.8}
											r={1.3}
											fill="#F59E0B"
											stroke="#fff"
											strokeWidth={0.3}
										/>
										<text
											x={STAND_SIZE - 0.8}
											y={0.8}
											textAnchor="middle"
											dominantBaseline="central"
											fontSize={1.4}
											fontWeight={700}
											fill="#fff"
											style={{ userSelect: "none" }}
										>
											%
										</text>
									</g>
								);
							})}
						</g>
					</MapCanvas>
				</TransformComponent>

				{/* Zoom hint (mobile only) */}
				<div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-10 md:hidden pointer-events-none">
					<div className="flex items-center gap-1.5 rounded-full bg-gray-900/80 px-3 py-1.5 text-white backdrop-blur-sm">
						<MapPin className="h-3 w-3" />
						<span className="text-xs font-medium">Pellizca para ampliar</span>
					</div>
				</div>

			</MapTransformWrapper>
		</div>
	);
}
