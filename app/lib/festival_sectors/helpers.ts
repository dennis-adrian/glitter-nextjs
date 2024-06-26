import { UserCategory } from "@/app/api/users/definitions";
import { FestivalSectorWithStands } from "@/app/lib/festival_sectors/definitions";

export function getFestivalSectorAllowedCategories(
  sector: FestivalSectorWithStands,
): UserCategory[] {
  return [...new Set(sector.stands.map((stand) => stand.standCategory))];
}
