import { getCategoryLabel } from "@/app/lib/maps/helpers";
import {
  MANAGEMENT_AREAS,
  type ManagementArea,
} from "@/app/lib/categories/definitions";

export const OTHER_MANAGEMENT_AREA = "other" as const;
export type CategoryGroupArea = ManagementArea | typeof OTHER_MANAGEMENT_AREA;

function sortCategories<T extends object>(rows: T[]): T[] {
  return rows.slice().sort((a, b) => {
    const sortA = "sortOrder" in a ? Number(a.sortOrder) : 0;
    const sortB = "sortOrder" in b ? Number(b.sortOrder) : 0;
    if (sortA !== sortB) return sortA - sortB;
    const labelA = "label" in a ? String(a.label) : "";
    const labelB = "label" in b ? String(b.label) : "";
    return labelA.localeCompare(labelB, "es");
  });
}

export function groupByManagementArea<T extends { category: string }>(
  rows: T[],
): { area: CategoryGroupArea; label: string; items: T[] }[] {
  const groups: { area: CategoryGroupArea; label: string; items: T[] }[] =
    MANAGEMENT_AREAS.map((area) => ({
      area,
      label: getCategoryLabel(area),
      items: sortCategories(rows.filter((row) => row.category === area)),
    }));

  groups.push({
    area: OTHER_MANAGEMENT_AREA,
    label: "Otras categorías",
    items: sortCategories(
      rows.filter(
        (row) => !MANAGEMENT_AREAS.some((area) => area === row.category),
      ),
    ),
  });

  return groups;
}
