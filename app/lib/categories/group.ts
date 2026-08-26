import { getCategoryLabel } from "@/app/lib/maps/helpers";
import {
  MANAGEMENT_AREAS,
  type ManagementArea,
} from "@/app/lib/categories/definitions";

export function groupByManagementArea<T extends { category: string }>(
  rows: T[],
): { area: ManagementArea; label: string; items: T[] }[] {
  return MANAGEMENT_AREAS.map((area) => ({
    area,
    label: getCategoryLabel(area),
    items: rows
      .filter((row) => row.category === area)
      .slice()
      .sort((a, b) => {
        const sortA = "sortOrder" in a ? Number(a.sortOrder) : 0;
        const sortB = "sortOrder" in b ? Number(b.sortOrder) : 0;
        if (sortA !== sortB) return sortA - sortB;
        const labelA = "label" in a ? String(a.label) : "";
        const labelB = "label" in b ? String(b.label) : "";
        return labelA.localeCompare(labelB, "es");
      }),
  }));
}
