"use client";

import { UserCategory } from "@/app/api/users/definitions";
import FestivalMapModal from "@/app/components/festivals/reservations/festival-map-modal";
import SectorCard from "@/app/components/festivals/reservations/sector-card";
import { Button } from "@/app/components/ui/button";
import { Progress } from "@/app/components/ui/progress";
import { FestivalSectorWithStandsWithReservationsWithParticipants } from "@/app/lib/festival_sectors/definitions";
import { FestivalBase } from "@/app/lib/festivals/definitions";
import { ArrowRightIcon } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Title from "@/app/components/atoms/title";

type SectorSelectionClientProps = {
	profileId: number;
	festivalId: number;
	sectors: FestivalSectorWithStandsWithReservationsWithParticipants[];
	generalMapUrl: FestivalBase["generalMapUrl"];
	profileCategory: UserCategory;
};

export default function SectorSelectionClient({
	profileId,
	festivalId,
	sectors,
	generalMapUrl,
	profileCategory,
}: SectorSelectionClientProps) {
	const router = useRouter();
	const [selectedSectorId, setSelectedSectorId] = useState<number | null>(null);

	const orderedSectors = [...sectors].sort((a, b) => {
		const aAvailable = a.stands.filter((s) => s.status === "available").length;
		const bAvailable = b.stands.filter((s) => s.status === "available").length;
		if (aAvailable > 0 && bAvailable === 0) return -1;
		if (aAvailable === 0 && bAvailable > 0) return 1;
		return a.orderInFestival - b.orderInFestival;
	});

	function handleNext() {
		if (selectedSectorId === null) return;
		router.push(
			`/profiles/${profileId}/festivals/${festivalId}/reservations/new/sectors/${selectedSectorId}`,
		);
	}

	return (
		<div className="flex min-h-[calc(100dvh-4rem)] flex-col">
			{/* Step indicator */}
			<div className="border-b bg-background px-4 py-3">
				<div className="mx-auto max-w-3xl">
					<div className="flex items-center justify-between text-xs">
						<span className="font-bold uppercase tracking-wider text-primary">
							Paso 1 de 3
						</span>
						<span className="text-muted-foreground">Selección de Sector</span>
					</div>
					<Progress value={33} className="mt-2 h-1.5" />
				</div>
			</div>

			{/* Content */}
			<div className="flex-1 px-4 py-4 md:py-6">
				<div className="mx-auto max-w-3xl">
					<Title level="h1">Elige tu sector</Title>
					<p className="mt-1 text-sm text-muted-foreground">
						Selecciona el sector del festival donde deseas ubicar tu stand.
					</p>

					{/* Festival map button */}
					<div className="mt-3 md:mt-5">
						<FestivalMapModal generalMapUrl={generalMapUrl} />
					</div>

					{/* Sector cards */}
					<div className="mt-3 md:mt-5">
						<Title level="h2">
							Sectores
							<span className="ml-2 text-muted-foreground font-normal text-sm md:text-base">
								{orderedSectors.length} hablitados para tu categoría
							</span>
						</Title>
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
							{orderedSectors.map((sector) => (
								<SectorCard
									key={sector.id}
									sector={sector}
									isSelected={selectedSectorId === sector.id}
									onSelect={() => setSelectedSectorId(sector.id)}
									profileCategory={profileCategory}
								/>
							))}
						</div>
					</div>

					{orderedSectors.length === 0 && (
						<div className="mt-8 text-center text-muted-foreground">
							No tienes sectores habilitados para este festival
						</div>
					)}
				</div>
			</div>

			{/* Sticky bottom button */}
			{orderedSectors.length > 0 && (
				<div className="sticky bottom-0 border-t bg-background p-4">
					<div className="mx-auto max-w-3xl">
						<Button
							className="w-full"
							size="lg"
							disabled={selectedSectorId === null}
							onClick={handleNext}
						>
							Siguiente
							<ArrowRightIcon className="ml-2 h-4 w-4" />
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}
