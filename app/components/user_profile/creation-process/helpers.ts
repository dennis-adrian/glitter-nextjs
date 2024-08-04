import { Subcategory } from "@/app/lib/subcategories/definitions";

export function getAvailableUserCategories(
  selectedCategory: Subcategory,
  categories: Subcategory[],
) {
  return categories.filter(
    (category) =>
      category.id !== selectedCategory.id &&
      selectedCategory.category === "entrepreneurship",
  );
}

export function getInitialAvailableCategories(
  userCategories: Subcategory[],
  subcategories: Subcategory[],
) {
  if (userCategories.length === 0) return subcategories;

  const mainCategory = userCategories[0];
  if (
    ["illustration", "gastronomy"].includes(mainCategory.category) ||
    mainCategory.label === "Skincare"
  ) {
    return [];
  }

  const userCategoriesIds = userCategories.map((category) => category.id);
  return subcategories.filter((subcategory) => {
    return (
      !userCategoriesIds.includes(subcategory.id) &&
      subcategory.category === "entrepreneurship"
    );
  });
}
