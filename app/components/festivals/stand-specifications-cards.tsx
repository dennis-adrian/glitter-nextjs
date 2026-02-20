"use client";

import { UserCategory } from "@/app/api/users/definitions";
import StandSpecificationsSectorCard from "@/app/components/festivals/stand-specifications-sector-card";
import { FestivalSectorWithStands, FestivalSectorWithStandsWithReservationsWithParticipants } from "@/app/lib/festival_sectors/definitions";
import { use } from "react";

export default function StandSpecificationsCards({
	profileCategory,
	festivalSectorsWithAllowedCategoriesPromise,
	fullSectors,
}: {
	profileCategory: UserCategory;
	festivalSectorsWithAllowedCategoriesPromise: Promise<
		(FestivalSectorWithStands & {
			allowedCategories: UserCategory[];
		})[]
	>;
	fullSectors: FestivalSectorWithStandsWithReservationsWithParticipants[];
}) {
	const festivalSectors = use(festivalSectorsWithAllowedCategoriesPromise);

	const sectorsForProfile = festivalSectors.filter((sector) =>
		sector.allowedCategories.includes(profileCategory),
	);

	return (
		<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
			{sectorsForProfile.map((sector) => (
				<StandSpecificationsSectorCard
					key={sector.id}
					sector={sector}
					category={profileCategory}
					fullSector={fullSectors.find((s) => s.id === sector.id)}
				/>
			))}
		</div>
	);
}
