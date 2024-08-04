import { Subcategory } from "@/app/lib/subcategories/definitions";

export function sortCategories(categories: Subcategory[]) {
  return categories.sort((a, b) => {
    if (a.label < b.label) return -1;
    if (a.label > b.label) return 1;
    return 0;
  });
}
