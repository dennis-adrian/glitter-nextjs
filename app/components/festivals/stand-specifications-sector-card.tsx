"use client";

import { UserCategory } from "@/app/api/users/definitions";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";
import MapCanvas from "@/app/components/maps/map-canvas";
import MapElement from "@/app/components/maps/map-element";
import MapStand from "@/app/components/maps/map-stand";
import { computeCanvasBounds } from "@/app/components/maps/map-utils";
import type { StandColors } from "@/app/components/maps/map-utils";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	FestivalSectorWithStands,
	FestivalSectorWithStandsWithReservationsWithParticipants,
} from "@/app/lib/festival_sectors/definitions";
import { MapIcon } from "lucide-react";
import { useState } from "react";

const MY_CATEGORY_COLORS: StandColors = {
	fill: "rgba(221,214,254,0.6)",
	hoverFill: "rgba(221,214,254,0.6)",
	stroke: "rgba(139,92,246,0.8)",
	text: "hsl(262,77%,49%)",
};

const OTHER_COLORS: StandColors = {
	fill: "rgba(229,231,235,0.35)",
	hoverFill: "rgba(229,231,235,0.35)",
	stroke: "rgba(209,213,219,0.4)",
	text: "#9CA3AF",
};

export default function StandSpecificationsSectorCard({
	sector,
	category,
	fullSector,
}: {
	sector: FestivalSectorWithStands & {
		allowedCategories: UserCategory[];
	};
	category: UserCategory;
	fullSector?: FestivalSectorWithStandsWithReservationsWithParticipants;
}) {
	const [mapOpen, setMapOpen] = useState(false);

	const effectiveCategory =
		category === "new_artist" ? "illustration" : category;
	const isMyCategory = (standCategory: string) =>
		standCategory === effectiveCategory ||
		(effectiveCategory === "illustration" && standCategory === "new_artist");

	const hasMap =
		fullSector?.stands.some(
			(s) =>
				s.positionLeft != null &&
				s.positionTop != null &&
				isMyCategory(s.standCategory),
		) ?? false;

	const sectorPrice =
		sector.stands.find((stand) => stand.standCategory === category)?.price ?? 0;

	let sectorSpecifications = "";
	if (category === "gastronomy") {
		sectorSpecifications =
			"80cm x 100cm (mesa completa). Área final. No puede compartir espacio.";
	} else {
		sectorSpecifications = "60cm x 120cm (media mesa).";
		if (category === "illustration") {
			sectorSpecifications += " Puede compartir espacio con otro ilustrador";
		} else {
			sectorSpecifications += " No puede compartir espacio con otro expositor";
		}
	}

	const servicesIncluded: string[] = [];
	// Adding services based on the sector
	if (
		sector.name.toLowerCase().includes("galer") ||
		sector.name.toLowerCase().includes("teatro") ||
		sector.name.toLowerCase().includes("lobby")
	) {
		servicesIncluded.push("Puntos de conexión a electricidad");
		servicesIncluded.push("Ambiente cerrado con aire acondicionado");
	}
	if (sector.name.toLowerCase().includes("apple")) {
		servicesIncluded.push("Ambiente abierto, techado");
	}
	if (sector.name.toLowerCase().includes("balliv")) {
		servicesIncluded.push("Puntos de conexión a electricidad");
		servicesIncluded.push("Ambiente semi-abierto, techado");
	}

	// Adding services based on the category
	if (category === "illustration") {
		servicesIncluded.push(
			"1 pin de regalo por participante (acompañantes no incluidos)",
		);
		servicesIncluded.push("1 credencial por participante");
		servicesIncluded.push(
			"1 credencial para acompañante en caso de no compartir espacio con otro ilustrador",
		);
	} else {
		servicesIncluded.push("1 pin de regalo");
		servicesIncluded.push("1 credencial para expositor");
		servicesIncluded.push("1 credencial para acompañante");
	}
	// All categories have these services
	servicesIncluded.push("2 sillas");
	servicesIncluded.push("Mesa incluida");

	return (
		<>
			<Card className="overflow-hidden">
				<CardContent className="p-0">
					<div className="bg-primary p-3">
						<h3 className="font-semibold text-primary-foreground">
							{sector.name}
						</h3>
					</div>
					<div className="p-4 space-y-3">
						<div className="flex justify-between items-start gap-3">
							<div>
								<span className="font-medium">Especificaciones:</span>
								<p className="text-muted-foreground">{sectorSpecifications}</p>
							</div>
							<Badge variant="outline" className="text-lg font-semibold">
								Bs{sectorPrice.toLocaleString()}
							</Badge>
						</div>

						<div>
							<span className="font-medium">Servicios Incluidos:</span>
							<ul className="text-muted-foreground list-disc pl-5 mt-1">
								{servicesIncluded.map((service, index) => (
									<li key={index}>{service}</li>
								))}
							</ul>
						</div>

						{hasMap && (
							<Button
								variant="link"
								size="sm"
								className="w-full mt-1"
								onClick={() => setMapOpen(true)}
							>
								<MapIcon className="w-4 h-4 mr-2" />
								Ver mapa del sector
							</Button>
						)}
					</div>
				</CardContent>
			</Card>

			{hasMap && fullSector && (
				<Dialog open={mapOpen} onOpenChange={setMapOpen}>
					<DialogContent className="max-w-lg">
						<DialogHeader>
							<DialogTitle>{sector.name}</DialogTitle>
							<DialogDescription>
								Esta imagen es solo una representación visual del sector. No
								permite la reserva de espacios en este momento.
							</DialogDescription>
						</DialogHeader>

						{/* Legend */}
						<div className="flex gap-4 flex-wrap mt-2">
							<div className="flex items-center gap-1.5 text-sm">
								<span
									className="inline-block w-4 h-4 rounded-sm border"
									style={{
										backgroundColor: MY_CATEGORY_COLORS.fill,
										borderColor: MY_CATEGORY_COLORS.stroke,
									}}
								/>
								<span>Tu categoría</span>
							</div>
							<div className="flex items-center gap-1.5 text-sm text-muted-foreground">
								<span
									className="inline-block w-4 h-4 rounded-sm border"
									style={{
										backgroundColor: OTHER_COLORS.fill,
										borderColor: OTHER_COLORS.stroke,
									}}
								/>
								<span>Otras categorías</span>
							</div>
						</div>

						{/* Map */}
						<MapCanvas
							config={computeCanvasBounds(
								fullSector.stands,
								fullSector.mapElements,
							)}
							className="w-full h-auto border rounded-md"
						>
							{fullSector.mapElements.map((el) => (
								<MapElement key={el.id} element={el} />
							))}
							{fullSector.stands
								.filter((s) => s.positionLeft != null && s.positionTop != null)
								.map((stand) => (
									<MapStand
										key={stand.id}
										stand={stand}
										canBeReserved={false}
										colors={
											isMyCategory(stand.standCategory)
												? MY_CATEGORY_COLORS
												: OTHER_COLORS
										}
									/>
								))}
						</MapCanvas>
					</DialogContent>
				</Dialog>
			)}
		</>
	);
}
