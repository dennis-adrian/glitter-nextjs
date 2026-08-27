import { subcategories } from "@/db/schema";

export const MANAGEMENT_AREAS = [
  "illustration",
  "entrepreneurship",
  "gastronomy",
] as const;

export type ManagementArea = (typeof MANAGEMENT_AREAS)[number];

export type CategoryVisibility = "hidden" | "listed" | "selectable";

export type Category = typeof subcategories.$inferSelect;
export type NewCategory = typeof subcategories.$inferInsert;

export type CategoryUsageCounts = {
  verified: number;
  paused: number;
  pending: number;
  rejected: number;
  banned: number;
  stands: number;
};

export type AdminCategory = Category & CategoryUsageCounts;

export type PublicCategory = Pick<
  Category,
  | "id"
  | "label"
  | "category"
  | "descriptionHtml"
  | "imageUrl"
  | "sortOrder"
  | "visibility"
>;

export function isManagementArea(
  value: string | null | undefined,
): value is ManagementArea {
  return (
    value === "illustration" ||
    value === "entrepreneurship" ||
    value === "gastronomy"
  );
}

export function participantCount(counts: Pick<CategoryUsageCounts, "verified" | "paused">) {
  return counts.verified + counts.paused;
}
