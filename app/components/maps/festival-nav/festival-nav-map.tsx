"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import { FestivalSectorWithStandsWithReservationsWithParticipants } from "@/app/lib/festival_sectors/definitions";
import FestivalNavSectorTabs from "@/app/components/maps/festival-nav/festival-nav-sector-tabs";
import FestivalNavMapCanvas from "@/app/components/maps/festival-nav/festival-nav-map-canvas";
import FestivalNavSearch, {
	ParticipantSearchEntry,
} from "@/app/components/maps/festival-nav/festival-nav-search";
import FestivalNavStandDrawer, {
	CouponProof,
} from "@/app/components/maps/festival-nav/festival-nav-stand-drawer";
import FestivalNavMapLegend from "@/app/components/maps/festival-nav/festival-nav-map-legend";

type FestivalNavMapProps = {
	festivalName: string;
	sectors: FestivalSectorWithStandsWithReservationsWithParticipants[];
	couponBookUserIds: number[];
	couponBookProofs: Record<number, CouponProof[]>;
	passportUserIds: number[];
};

export default function FestivalNavMap({
	festivalName,
	sectors,
	couponBookUserIds,
	couponBookProofs,
	passportUserIds,
}: FestivalNavMapProps) {
	// -1 = "all sectors" view
	const [activeSectorIndex, setActiveSectorIndex] = useState(-1);
	const [selectedStand, setSelectedStand] =
		useState<StandWithReservationsWithParticipants | null>(null);
	const [selectedSectorName, setSelectedSectorName] = useState("");
	const [drawerOpen, setDrawerOpen] = useState(false);

	const sectorDivRefs = useRef<Map<number, HTMLDivElement>>(new Map());

	const couponBookUserIdSet = useMemo(
		() => new Set(couponBookUserIds),
		[couponBookUserIds],
	);

	const passportUserIdSet = useMemo(
		() => new Set(passportUserIds),
		[passportUserIds],
	);

	// Build participant search index across all sectors
	const searchEntries = useMemo<ParticipantSearchEntry[]>(() => {
		const entries: ParticipantSearchEntry[] = [];
		sectors.forEach((sector, sectorIndex) => {
			sector.stands.forEach((stand) => {
				if (stand.status === "disabled") return;
				const standLabel = `${stand.label}${stand.standNumber}`;
				stand.reservations
					.filter((r) => r.status !== "rejected")
					.flatMap((r) => r.participants)
					.forEach((participant) => {
						if (!participant.user.displayName) return;
						entries.push({
							displayName: participant.user.displayName,
							imageUrl: participant.user.imageUrl,
							standLabel,
							sectorName: sector.name,
							sectorIndex,
							stand,
						});
					});
			});
		});
		return entries;
	}, [sectors]);

	const handleStandSelect = useCallback(
		(stand: StandWithReservationsWithParticipants, sectorName: string) => {
			setSelectedStand(stand);
			setSelectedSectorName(sectorName);
			setDrawerOpen(true);
		},
		[],
	);

	const handleSearchSelect = useCallback(
		(entry: ParticipantSearchEntry) => {
			setSelectedStand(entry.stand);
			setSelectedSectorName(entry.sectorName);
			setDrawerOpen(true);

			if (activeSectorIndex === -1) {
				// All-view: scroll the page to the sector div
				const sectorDiv = sectorDivRefs.current.get(
					sectors[entry.sectorIndex]?.id,
				);
				if (sectorDiv) {
					setTimeout(() => {
						sectorDiv.scrollIntoView({ behavior: "smooth", block: "start" });
					}, 50);
				}
			} else {
				// Single-sector view: switch to the correct sector
				setActiveSectorIndex(entry.sectorIndex);
			}
		},
		[activeSectorIndex, sectors],
	);

	const showAll = activeSectorIndex === -1;
	const activeSector = showAll ? null : (sectors[activeSectorIndex] ?? null);

	const getSectorMapBounds = (
		sector: FestivalSectorWithStandsWithReservationsWithParticipants,
	) =>
		sector.mapOriginX != null &&
		sector.mapOriginY != null &&
		sector.mapWidth != null &&
		sector.mapHeight != null
			? {
					minX: sector.mapOriginX,
					minY: sector.mapOriginY,
					width: sector.mapWidth,
					height: sector.mapHeight,
				}
			: undefined;

	return (
		<div className="container flex flex-col gap-4 py-4">
			{/* Compact header */}
			<div className="px-4">
				<h1 className="text-base font-semibold truncate">{festivalName}</h1>
				<p className="text-xs text-muted-foreground">Mapa del festival</p>
			</div>

			{/* Search + tabs — sticky below navbar */}
			<div className="sticky top-16 md:top-20 z-20 bg-background border-b">
				<FestivalNavSearch
					entries={searchEntries}
					onSelect={handleSearchSelect}
				/>
				<FestivalNavSectorTabs
					sectors={sectors}
					activeIndex={activeSectorIndex}
					onChange={setActiveSectorIndex}
				/>
			</div>

			{/* Legend */}
			<div className="flex justify-center px-4 md:px-0">
				<div className="w-full md:max-w-3xl">
					<FestivalNavMapLegend />
				</div>
			</div>

			{/* Map area */}
			<div className="flex justify-center px-4 md:px-0">
				<div className="w-full md:max-w-3xl">
					{showAll ? (
						<div className="flex flex-col gap-4">
							{sectors.map((sector) => (
								<div
									key={sector.id}
									className="scroll-mt-36 md:scroll-mt-40"
									ref={(el) => {
										if (el) sectorDivRefs.current.set(sector.id, el);
										else sectorDivRefs.current.delete(sector.id);
									}}
								>
									{sectors.length > 1 && (
										<p className="px-4 py-2 text-sm font-semibold text-muted-foreground border-b">
											{sector.name}
										</p>
									)}
									<FestivalNavMapCanvas
										stands={sector.stands}
										mapElements={sector.mapElements ?? []}
										mapBounds={getSectorMapBounds(sector)}
										selectedStandId={selectedStand?.id ?? null}
										couponBookUserIdSet={couponBookUserIdSet}
										passportUserIdSet={passportUserIdSet}
										sectorName={sector.name}
										onStandSelect={handleStandSelect}
									/>
								</div>
							))}
						</div>
					) : activeSector ? (
						<FestivalNavMapCanvas
							key={activeSector.id}
							stands={activeSector.stands}
							mapElements={activeSector.mapElements ?? []}
							mapBounds={getSectorMapBounds(activeSector)}
							selectedStandId={selectedStand?.id ?? null}
							couponBookUserIdSet={couponBookUserIdSet}
							passportUserIdSet={passportUserIdSet}
							sectorName={activeSector.name}
							onStandSelect={handleStandSelect}
						/>
					) : (
						<p className="text-center text-muted-foreground text-sm py-8">
							No hay mapa disponible.
						</p>
					)}
				</div>
			</div>

			{/* Stand detail drawer */}
			<FestivalNavStandDrawer
				stand={selectedStand}
				sectorName={selectedSectorName}
				open={drawerOpen}
				onOpenChange={setDrawerOpen}
				couponBookProofs={couponBookProofs}
				passportUserIdSet={passportUserIdSet}
			/>
		</div>
	);
}
