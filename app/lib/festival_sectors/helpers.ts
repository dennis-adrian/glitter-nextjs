import { UserCategory } from "@/app/api/users/definitions";
import { FestivalSectorWithStands } from "@/app/lib/festival_sectors/definitions";

export function getFestivalSectorAllowedCategories(
  sector: FestivalSectorWithStands,
  allCategories?: boolean,
): UserCategory[] {
  const categories = [
    ...new Set(sector.stands.map((stand) => stand.standCategory)),
  ];

  if (allCategories) return categories;

  return categories.filter((category) => category !== "new_artist");
}
