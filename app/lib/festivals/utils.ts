// This methods should be used in both ui and sever

import { UserCategory } from "@/app/api/users/definitions";
import {
  Festival,
  FestivalWithSectors,
} from "@/app/data/festivals/definitions";
import { getFestivalSectorAllowedCategories } from "../festival_sectors/helpers";

export function getFestivalAvaibleStandsByCategory(
  festival?: Festival | null,
  category?: UserCategory,
) {
  if (!(festival && category)) return [];
  const stands = festival.festivalSectors.flatMap((sector) => sector.stands);
  return stands.filter(
    (stand) => stand.status === "available" && stand.standCategory === category,
  );
}

export function getFestivalCategories(festival?: FestivalWithSectors | null) {
  if (!festival) return [];

  const sectorsCategories = festival.festivalSectors.flatMap((sector) =>
    getFestivalSectorAllowedCategories(sector, true),
  );

  return [...new Set(sectorsCategories)];
}
