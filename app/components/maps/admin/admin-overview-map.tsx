"use client";

import { useCallback, useState } from "react";
import { TransformComponent } from "react-zoom-pan-pinch";
import { MapPin } from "lucide-react";

import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import { InvoiceWithParticipants } from "@/app/data/invoices/definitions";
import { FestivalSectorWithStandsWithReservationsWithParticipants } from "@/app/lib/festival_sectors/definitions";
import {
	computeCanvasBounds,
	getAdminOverviewColors,
} from "@/app/components/maps/map-utils";
import MapCanvas from "@/app/components/maps/map-canvas";
import MapStand from "@/app/components/maps/map-stand";
import MapElement from "@/app/components/maps/map-element";
import MapToolbar from "@/app/components/maps/map-toolbar";
import MapTransformWrapper from "@/app/components/maps/map-transform-wrapper";
import AdminOverviewStandDrawer from "@/app/components/maps/admin/admin-overview-stand-drawer";
import { Tabs, TabsList, TabsTrigger } from "@/app/components/ui/tabs";

type AdminOverviewMapProps = {
	sectors: FestivalSectorWithStandsWithReservationsWithParticipants[];
	invoices: InvoiceWithParticipants[];
};

const LEGEND_ITEMS = [
	{
		color: "rgba(255, 255, 255, 0.9)",
		border: "rgba(209, 213, 219, 0.6)",
		label: "Disponible",
	},
	{
		color: "rgba(229, 231, 235, 0.35)",
		border: "rgba(209, 213, 219, 0.4)",
		label: "Deshabilitado",
	},
	{
		color: "rgba(251, 191, 36, 0.6)",
		border: "rgba(217, 119, 6, 0.8)",
		label: "En espera",
	},
	{
		color: "rgba(134, 239, 172, 0.7)",
		border: "rgba(34, 197, 94, 0.9)",
		label: "Pago pendiente",
	},
	{
		color: "rgba(96, 165, 250, 0.7)",
		border: "rgba(37, 99, 235, 0.9)",
		label: "Pagado por confirmar",
	},
	{
		color: "hsl(262, 77%, 49%)",
		border: "hsl(262, 77%, 35%)",
		label: "Confirmado",
	},
];

export default function AdminOverviewMap({
	sectors,
	invoices,
}: AdminOverviewMapProps) {
	const [activeSectorId, setActiveSectorId] = useState<string>(
		String(sectors[0]?.id ?? ""),
	);
	const [selectedStand, setSelectedStand] =
		useState<StandWithReservationsWithParticipants | null>(null);
	const [drawerOpen, setDrawerOpen] = useState(false);

	const activeSector =
		sectors.find((s) => String(s.id) === activeSectorId) ?? sectors[0];

	const handleSectorChange = useCallback((value: string) => {
		setActiveSectorId(value);
		setSelectedStand(null);
		setDrawerOpen(false);
	}, []);

	const visibleStands =
		activeSector?.stands.filter((s) => s.status !== "disabled") ?? [];

	const canvasBounds = computeCanvasBounds(
		activeSector?.stands ?? [],
		activeSector?.mapElements ?? [],
	);

	const findInvoiceForStand = useCallback(
		(standId: number): InvoiceWithParticipants | null => {
			return (
				invoices.find((inv) => inv.reservation.standId === standId) ?? null
			);
		},
		[invoices],
	);

	const getReservationStatus = useCallback(
		(standId: number): string | null => {
			const inv = findInvoiceForStand(standId);
			return inv?.reservation.status ?? null;
		},
		[findInvoiceForStand],
	);

	const handleStandClick = useCallback(
		(stand: StandWithReservationsWithParticipants) => {
			setSelectedStand(stand);
			setDrawerOpen(true);
		},
		[],
	);

	const selectedInvoice = selectedStand
		? findInvoiceForStand(selectedStand.id)
		: null;

	return (
		<div className="space-y-4">
			{/* Sector tabs */}
			{sectors.length > 1 && (
				<Tabs value={activeSectorId} onValueChange={handleSectorChange}>
					<TabsList>
						{sectors.map((sector) => (
							<TabsTrigger key={sector.id} value={String(sector.id)}>
								{sector.name}
							</TabsTrigger>
						))}
					</TabsList>
				</Tabs>
			)}

			{/* Legend */}
			<div className="flex flex-wrap gap-x-4 gap-y-2">
				{LEGEND_ITEMS.map((item) => (
					<div key={item.label} className="flex items-center gap-1.5">
						<span
							className="inline-block h-3.5 w-3.5 rounded-sm border"
							style={{
								backgroundColor: item.color,
								borderColor: item.border,
							}}
						/>
						<span className="text-xs text-muted-foreground">{item.label}</span>
					</div>
				))}
			</div>

			{/* Map */}
			<div className="flex flex-col items-center w-full">
				<MapTransformWrapper initialScale={1} minScale={1} maxScale={4} centerOnInit>
					<div className="flex w-full max-w-[500px] items-center justify-between pb-2">
						<p className="text-sm text-muted-foreground font-medium">
							{activeSector?.name}
						</p>
						<MapToolbar />
					</div>
					<div className="relative w-full max-w-[500px] rounded-lg border bg-background shadow-sm overflow-hidden pb-8 md:pb-0">
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
								{activeSector?.mapElements.map((element) => (
									<MapElement key={`el-${element.id}`} element={element} />
								))}
								{visibleStands.map((stand) => (
									<MapStand
										key={stand.id}
										stand={stand}
										canBeReserved={false}
										colors={getAdminOverviewColors(
											stand.status,
											getReservationStatus(stand.id),
										)}
										onClick={handleStandClick}
										onTouchTap={handleStandClick}
									/>
								))}
							</MapCanvas>
						</TransformComponent>
						<div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 md:hidden">
							<div className="flex items-center gap-1.5 rounded-full bg-gray-900/80 px-3 py-1.5 text-white backdrop-blur-sm">
								<MapPin className="h-3 w-3" />
								<span className="text-xs font-medium">
									Pellizca para ampliar
								</span>
							</div>
						</div>
					</div>
				</MapTransformWrapper>
			</div>

			{/* Stand detail drawer */}
			<AdminOverviewStandDrawer
				stand={selectedStand}
				invoice={selectedInvoice}
				sectorName={activeSector?.name ?? ""}
				open={drawerOpen}
				onOpenChange={setDrawerOpen}
			/>
		</div>
	);
}
