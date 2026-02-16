"use client";

import { useCallback, useState } from "react";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import { ZoomIn } from "lucide-react";

import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import { MapElementBase } from "@/app/lib/map_elements/definitions";
import { computeCanvasBounds, getPublicStandColors } from "@/app/components/maps/map-utils";

import MapCanvas from "@/app/components/maps/map-canvas";
import MapStand from "@/app/components/maps/map-stand";
import MapElement from "@/app/components/maps/map-element";
import MapToolbar from "@/app/components/maps/map-toolbar";
import PublicMapLegend from "@/app/components/maps/public/public-map-legend";
import PublicMapTooltip from "@/app/components/maps/public/public-map-tooltip";
import PublicMapDrawer from "@/app/components/maps/public/public-map-drawer";

type PublicMapProps = {
	stands: StandWithReservationsWithParticipants[];
	mapElements?: MapElementBase[];
	mapBounds?: { minX: number; minY: number; width: number; height: number };
};

export default function PublicMap({
	stands,
	mapElements,
	mapBounds,
}: PublicMapProps) {
	const [hoveredStand, setHoveredStand] =
		useState<StandWithReservationsWithParticipants | null>(null);
	const [hoveredRect, setHoveredRect] = useState<DOMRect | null>(null);
	const [tappedStand, setTappedStand] =
		useState<StandWithReservationsWithParticipants | null>(null);
	const [drawerOpen, setDrawerOpen] = useState(false);

	const visibleStands = stands.filter((s) => s.status !== "disabled");

	const handleHoverChange = useCallback(
		(
			stand: StandWithReservationsWithParticipants | null,
			rect: DOMRect | null,
		) => {
			setHoveredStand(stand);
			setHoveredRect(rect);
		},
		[],
	);

	const handleTouchTap = useCallback(
		(stand: StandWithReservationsWithParticipants) => {
			setTappedStand(stand);
			setDrawerOpen(true);
		},
		[],
	);

	const canvasBounds = mapBounds ?? computeCanvasBounds(visibleStands, mapElements);

	return (
		<div className="flex flex-col items-center w-full">
			<PublicMapLegend />
			<TransformWrapper
				initialScale={1}
				minScale={1}
				maxScale={4}
				centerOnInit
				wheel={{ step: 0.1 }}
			>
				<div className="w-full md:max-w-2xl rounded-lg border bg-background shadow-sm overflow-hidden">
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
							{visibleStands.map((stand) => (
								<MapStand
									key={stand.id}
									stand={stand}
									canBeReserved={false}
									colors={getPublicStandColors(stand.status)}
									onHoverChange={handleHoverChange}
									onTouchTap={handleTouchTap}
								/>
							))}
						</MapCanvas>
					</TransformComponent>
				</div>
				{hoveredStand && hoveredRect && (
					<PublicMapTooltip
						stand={hoveredStand}
						anchorRect={hoveredRect}
					/>
				)}
				<PublicMapDrawer
					stand={tappedStand}
					open={drawerOpen}
					onOpenChange={setDrawerOpen}
				/>
				<div className="flex items-center gap-3 mt-2">
					<MapToolbar />
					<p className="text-xs text-muted-foreground flex items-center gap-1">
						<ZoomIn className="h-3 w-3" />
						<span className="md:hidden">Pellizca para acercar</span>
						<span className="hidden md:inline">
							Usa scroll o los botones para acercar
						</span>
					</p>
				</div>
			</TransformWrapper>
		</div>
	);
}
