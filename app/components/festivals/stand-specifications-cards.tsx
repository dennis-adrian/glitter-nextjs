import { UserCategory } from "@/app/api/users/definitions";
import StandSpecificationsSectorCard from "@/app/components/festivals/stand-specifications-sector-card";
import { fetchFestivalSectorsWithAllowedCategories } from "@/app/lib/festival_sectors/actions";

export default async function StandSpecificationsCards({
	festivalId,
	profileCategory,
}: {
	festivalId: number;
	profileCategory: UserCategory;
}) {
	const festivalSectors =
		await fetchFestivalSectorsWithAllowedCategories(festivalId);

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
