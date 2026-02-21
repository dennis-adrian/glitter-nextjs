"use client";

import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import { MapPin } from "lucide-react";

import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import { BaseProfile, ProfileType } from "@/app/api/users/definitions";
import { MapElementBase } from "@/app/lib/map_elements/definitions";
import { canStandBeReserved } from "@/app/lib/stands/helpers";

import MapCanvas from "@/app/components/maps/map-canvas";
import MapStand from "@/app/components/maps/map-stand";
import MapElement from "@/app/components/maps/map-element";
import MapToolbar from "@/app/components/maps/map-toolbar";
import MapLegend from "@/app/components/maps/map-legend";
import { computeCanvasBounds } from "@/app/components/maps/map-utils";

type UserMapProps = {
	stands: StandWithReservationsWithParticipants[];
	mapElements?: MapElementBase[];
	mapBounds?: { minX: number; minY: number; width: number; height: number };
	profile?: ProfileType | BaseProfile | null;
	selectedStandId?: number | null;
	onStandClick?: (stand: StandWithReservationsWithParticipants) => void;
	onStandTouchTap?: (stand: StandWithReservationsWithParticipants) => void;
};

export default function UserMap({
	stands,
	mapElements,
	mapBounds,
	profile,
	selectedStandId,
	onStandClick,
	onStandTouchTap,
}: UserMapProps) {
	const canvasBounds = mapBounds ?? computeCanvasBounds(stands, mapElements);

	return (
		<div className="flex flex-col items-center w-full">
			<TransformWrapper
				initialScale={1}
				minScale={1}
				maxScale={4}
				centerOnInit
				wheel={{ step: 0.1 }}
			>
				<div className="flex w-full md:max-w-2xl items-center justify-between pb-2">
					<MapLegend />
					<MapToolbar />
				</div>
				<div className="relative w-full md:max-w-2xl rounded-lg border bg-background shadow-sm overflow-hidden pb-8 md:pb-0">
					<TransformComponent
						wrapperStyle={{ width: "100%" }}
						contentStyle={{ width: "100%" }}
					>
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
							{stands.map((stand) => {
								const standCanBeReserved =
									!!profile && canStandBeReserved(stand, profile);

								return (
									<MapStand
										key={stand.id}
										stand={stand}
										canBeReserved={standCanBeReserved}
										selected={stand.id === selectedStandId}
										onClick={onStandClick}
										onTouchTap={onStandTouchTap}
									/>
								);
							})}
						</MapCanvas>
					</TransformComponent>
					<div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 md:hidden">
						<div className="flex items-center gap-1.5 rounded-full bg-gray-900/80 px-3 py-1.5 text-white backdrop-blur-sm">
							<MapPin className="h-3 w-3" />
							<span className="text-xs font-medium">Pellizca para ampliar</span>
						</div>
					</div>
				</div>
			</TransformWrapper>
		</div>
	);
}
