"use client";

import { UserCategory } from "@/app/api/users/definitions";
import StandSpecificationsSectorCard from "@/app/components/festivals/stand-specifications-sector-card";
import { FestivalSectorWithStands } from "@/app/lib/festival_sectors/definitions";
import { use } from "react";

export default function StandSpecificationsCards({
	profileCategory,
	festivalSectorsWithAllowedCategoriesPromise,
}: {
	profileCategory: UserCategory;
	festivalSectorsWithAllowedCategoriesPromise: Promise<
		(FestivalSectorWithStands & {
			allowedCategories: UserCategory[];
		})[]
	>;
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
				/>
			))}
		</div>
	);
}
