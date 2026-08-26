import type { CategoryVisibility } from "@/app/lib/categories/definitions";

export function isPubliclyListed(visibility: CategoryVisibility): boolean {
  return visibility === "listed" || visibility === "selectable";
}

export function isParticipantSelectable(
  visibility: CategoryVisibility,
  isAdminAssignableOnly: boolean,
): boolean {
  return visibility === "selectable" && !isAdminAssignableOnly;
}

export function isAdminAssignable(visibility: CategoryVisibility): boolean {
  return visibility !== "hidden";
}
