import type { CategoryUsageCounts } from "@/app/lib/categories/definitions";
import { hasLinkedAssignments } from "@/app/lib/categories/definitions";

export function isDeleteBlocked(counts: CategoryUsageCounts): boolean {
  return counts.verified > 0 || counts.paused > 0 || counts.stands > 0;
}

export function shouldWarnRenameMove(
  hasNameOrAreaChange: boolean,
  counts: CategoryUsageCounts,
): boolean {
  return hasNameOrAreaChange && hasLinkedAssignments(counts);
}

export function unverifiedLinkedCounts(counts: CategoryUsageCounts) {
  return {
    pending: counts.pending,
    rejected: counts.rejected,
    banned: counts.banned,
  };
}

export function hasUnverifiedLinks(counts: CategoryUsageCounts): boolean {
  const other = unverifiedLinkedCounts(counts);
  return (
    other.pending + other.rejected + other.banned > 0
  );
}
