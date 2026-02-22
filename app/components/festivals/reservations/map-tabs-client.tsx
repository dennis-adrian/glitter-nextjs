"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ProfileType } from "@/app/api/users/definitions";
import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import ClientMap from "@/app/components/festivals/client-map";
import StepIndicator from "@/app/components/festivals/reservations/step-indicator";
import { FestivalSectorWithStandsWithReservationsWithParticipants } from "@/app/lib/festival_sectors/definitions";
import { FestivalBase } from "@/app/lib/festivals/definitions";

type ActiveHold = { id: number; standId: number } | null;

type MapTabsClientProps = {
	festival: FestivalBase;
	profile: ProfileType;
	sectors: FestivalSectorWithStandsWithReservationsWithParticipants[];
	activeHold: ActiveHold;
	subcategoryIds: number[];
};

function getMapBounds(
	sector: FestivalSectorWithStandsWithReservationsWithParticipants,
) {
	if (
		sector.mapOriginX != null &&
		sector.mapOriginY != null &&
		sector.mapWidth != null &&
		sector.mapHeight != null
	) {
		return {
			minX: sector.mapOriginX,
			minY: sector.mapOriginY,
			width: sector.mapWidth,
			height: sector.mapHeight,
		};
	}
	return undefined;
}

function computeAvailableCount(
	stands: StandWithReservationsWithParticipants[],
	profile: ProfileType,
	subcategoryIds: number[],
): number {
	const effectiveCategory =
		profile.category === "new_artist" ? "illustration" : profile.category;
	return stands.filter(
		(s) =>
			s.standCategory === effectiveCategory &&
			s.participationType === profile.participationType &&
			s.status === "available" &&
			(s.standSubcategories.length === 0 ||
				s.standSubcategories.some((sc) =>
					subcategoryIds.includes(sc.subcategoryId),
				)),
	).length;
}

function MapDisclaimer() {
	return (
		<p className="text-center text-[10px] md:text-xs text-muted-foreground leading-3 md:leading-4 max-w-[400px]">
			El plano muestra las ubicaciones y la distribución confirmada de los
			stands. Las medidas y proporciones de todos los elementos son estimadas y
			se utilizan de manera orientativa.
		</p>
	);
}

export default function MapTabsClient({
	festival,
	profile,
	sectors,
	activeHold,
	subcategoryIds,
}: MapTabsClientProps) {
	const orderedSectors = [...sectors].sort(
		(a, b) => a.orderInFestival - b.orderInFestival,
	);
	const [activeTabId, setActiveTabId] = useState(() => {
		const firstWithAvailable = orderedSectors.find(
			(s) => computeAvailableCount(s.stands, profile, subcategoryIds) > 0,
		);
		return (firstWithAvailable ?? orderedSectors[0])?.id ?? null;
	});
	const [standCounts, setStandCounts] = useState<Record<number, number>>(() =>
		Object.fromEntries(
			sectors.map((s) => [
				s.id,
				computeAvailableCount(s.stands, profile, subcategoryIds),
			]),
		),
	);

	if (sectors.length === 0) {
		return (
			<div className="flex flex-col min-h-[calc(100dvh-4rem)]">
				<StepIndicator
					step={1}
					totalSteps={3}
					backLabel="Mi perfil"
					backHref="/my_profile"
				/>
				<div className="flex-1 flex items-center justify-center text-muted-foreground">
					No tienes sectores habilitados para este festival
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col min-h-[calc(100dvh-4rem)]">
			<StepIndicator
				step={1}
				totalSteps={3}
				backLabel="Mi perfil"
				backHref="/my_profile"
			/>
			<div className="max-w-3xl mx-auto px-4 py-4 md:py-6 w-full">
				{/* Sector tab buttons */}
				<div className="flex gap-2 flex-wrap mb-4">
					{orderedSectors.map((sector) => {
						const isActive = sector.id === activeTabId;
						return (
							<button
								key={sector.id}
								type="button"
								onClick={() => setActiveTabId(sector.id)}
								className={cn(
									"flex flex-col items-start text-left px-4 py-3 rounded-xl border-2 min-w-[110px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
									isActive
										? "bg-primary border-primary text-primary-foreground"
										: "bg-card border-border text-foreground hover:border-primary/50",
								)}
							>
								<span className="font-bold text-sm leading-tight">
									{sector.name}
								</span>
								<span
									className={cn(
										"text-xs mt-0.5",
										isActive ? "opacity-80" : "text-muted-foreground",
									)}
								>
									{standCounts[sector.id] ?? 0} disp.
								</span>
							</button>
						);
					})}
				</div>

				{/* Active sector map */}
				{orderedSectors.map((sector) =>
					sector.id === activeTabId ? (
						<div key={sector.id} className="flex flex-col items-center gap-2">
							<div className="w-full md:max-w-2xl mx-auto">
								<ClientMap
									festival={festival}
									profile={profile}
									sectorId={sector.id}
									sectorName={sector.name}
									stands={sector.stands}
									mapElements={sector.mapElements ?? []}
									activeHold={activeHold}
									subcategoryIds={subcategoryIds}
									mapBounds={getMapBounds(sector)}
									onStandsChange={(stands) =>
										setStandCounts((prev) => ({
											...prev,
											[sector.id]: computeAvailableCount(
												stands,
												profile,
												subcategoryIds,
											),
										}))
									}
								/>
							</div>
							<MapDisclaimer />
						</div>
					) : null,
				)}
			</div>
		</div>
	);
}
