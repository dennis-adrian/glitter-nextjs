// This methods should be used in both ui and sever

import { UserCategory } from "@/app/api/users/definitions";
import { getFestivalSectorAllowedCategories } from "../festival_sectors/helpers";
import { Festival, FestivalBase, FestivalWithSectors } from "./definitions";

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

export function getFestivalsOptions(festivals: FestivalBase[]) {
  return festivals.map((festival) => ({
    label: festival.name,
    value: festival.id.toString(),
  }));
}

export function groupVisitorEmails(visitors: { id: number; email: string }[]) {
  const visitorEmails = visitors.map((visitor) => visitor.email);
  let emailGroups: string[][] = [];
  for (let i = 0; i < visitorEmails.length; i += 50) {
    let group = visitorEmails.slice(i, i + 50);
    emailGroups.push(group);
  }

  return emailGroups;
}
