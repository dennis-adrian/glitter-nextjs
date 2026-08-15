import type { StandBase } from "@/app/api/stands/definitions";
import type { FestivalActivity } from "@/app/lib/festivals/definitions";

/**
 * The legend doubles as the map's filter control, so the vocabulary lives here:
 * both the legend (maps) and the visitor filters (festivals) depend on it
 * rather than on each other.
 */
export type StandStatusFilter = "all" | "occupied" | "available";

export const STAND_ACTIVITY_FILTERS = [
  "coupon_book",
  "stamp_passport",
  "sticker_hunt",
  "festival_sticker",
] as const;

export type StandActivityFilter = (typeof STAND_ACTIVITY_FILTERS)[number];

export type StandFilters = {
  status: StandStatusFilter;
  activities: StandActivityFilter[];
};

export type StandActivityUserIds = Record<StandActivityFilter, Set<number>>;

export function emptyStandActivityUserIds(): StandActivityUserIds {
  return {
    coupon_book: new Set<number>(),
    stamp_passport: new Set<number>(),
    sticker_hunt: new Set<number>(),
    festival_sticker: new Set<number>(),
  };
}

export const EMPTY_STAND_FILTERS: StandFilters = {
  status: "all",
  activities: [],
};

export function isStandActivityFilter(
  type: FestivalActivity["type"],
): type is StandActivityFilter {
  return (STAND_ACTIVITY_FILTERS as readonly string[]).includes(type);
}

export function hasActiveStandFilters(filters: StandFilters): boolean {
  return filters.status !== "all" || filters.activities.length > 0;
}

export function isStandOccupied(stand: Pick<StandBase, "status">): boolean {
  return stand.status === "reserved" || stand.status === "confirmed";
}

export function matchesStandStatusFilter(
  stand: Pick<StandBase, "status">,
  status: StandStatusFilter,
): boolean {
  if (status === "all") return true;
  if (status === "occupied") return isStandOccupied(stand);
  return stand.status === "available";
}

/**
 * Activity filters are OR'd: a stand carrying any selected marker matches.
 * An empty selection means the group is inactive, not that nothing matches.
 */
export function matchesStandActivityFilters(
  userId: number,
  activities: StandActivityFilter[],
  activityUserIds: StandActivityUserIds,
): boolean {
  if (activities.length === 0) return true;
  return activities.some((activity) => activityUserIds[activity].has(userId));
}

export function toggleStandActivityFilter(
  activities: StandActivityFilter[],
  activity: StandActivityFilter,
): StandActivityFilter[] {
  return activities.includes(activity)
    ? activities.filter((value) => value !== activity)
    : [...activities, activity];
}
