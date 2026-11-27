import type { ParticipantCategoryFilter } from "@/app/components/festivals/festival-participant-category-filters";
import type { PublicFestivalParticipant } from "@/app/components/festivals/participant-info";
import {
  fieldMatchesQuery,
  normalizeParticipantSearch,
  type ParticipantSearchEntry,
} from "@/app/components/maps/festival-nav/festival-nav-participant-search";
import type { FestivalSectorWithStandsWithReservationsWithParticipants } from "@/app/lib/festival_sectors/definitions";
import { hasActivityParticipant } from "@/app/components/maps/map-participants";
import { getPublicCategoryLabel } from "@/app/lib/maps/helpers";
import {
  hasActiveStandFilters,
  matchesStandActivityFilters,
  matchesStandStatusFilter,
  type StandActivityUserIds,
  type StandFilters,
} from "@/app/lib/maps/stand-filters";
import { formatStandLabel } from "@/app/lib/stands/helpers";

function participantMatchesQuery(
  participant: PublicFestivalParticipant,
  normalizedQuery: string,
) {
  if (!normalizedQuery) return true;

  // Tested field by field rather than over one joined string: normalization
  // drops the separators, so a joined string would let a query straddle the end
  // of a name and the start of a stand label.
  return [
    participant.displayName,
    ...participant.stands.map(formatStandLabel),
    getPublicCategoryLabel(participant.category),
  ].some((field) => !!field && fieldMatchesQuery(field, normalizedQuery));
}

/**
 * The participant grid follows every filter that describes a participant.
 * Stand status is deliberately left out: every listed participant sits on an
 * occupied stand, so "Disponible" could only ever empty the grid.
 */
export function filterFestivalParticipants({
  participants,
  query,
  category,
  sectorStandIds,
  activities = [],
  activityUserIds,
}: {
  participants: PublicFestivalParticipant[];
  query: string;
  category: ParticipantCategoryFilter;
  sectorStandIds?: ReadonlySet<number>;
  activities?: StandFilters["activities"];
  activityUserIds?: StandActivityUserIds;
}) {
  const normalizedQuery = normalizeParticipantSearch(query.trim());

  return [...participants].filter((participant) => {
    if (category !== "all" && participant.category !== category) {
      return false;
    }
    // No sector scope (all-sectors / -1) keeps participants with empty stands.
    if (sectorStandIds) {
      const hasStandInSector = participant.stands.some((stand) =>
        sectorStandIds.has(stand.id),
      );
      if (!hasStandInSector) return false;
    }
    if (
      activityUserIds &&
      !matchesStandActivityFilters(participant.id, activities, activityUserIds)
    ) {
      return false;
    }
    return participantMatchesQuery(participant, normalizedQuery);
  });
}

/**
 * Stands the map should keep lit for the legend's filters alone, or null when
 * none is on.
 *
 * Activities are resolved over each stand's occupants with the same rule the
 * badges are drawn with, so a stand showing a selected marker always matches.
 * Search entries would not do: they leave out anyone without a display name
 * and any reservation not yet accepted, both of which still carry a badge.
 */
export function getStandFilterMatchingStandIds({
  sectors,
  standFilters,
  activityUserIds,
}: {
  sectors: FestivalSectorWithStandsWithReservationsWithParticipants[];
  standFilters: StandFilters;
  activityUserIds: StandActivityUserIds;
}): number[] | null {
  if (!hasActiveStandFilters(standFilters)) return null;

  const matching: number[] = [];

  for (const sector of sectors) {
    for (const stand of sector.stands) {
      if (stand.status === "disabled") continue;
      if (!matchesStandStatusFilter(stand, standFilters.status)) continue;
      if (
        standFilters.activities.length > 0 &&
        !standFilters.activities.some((activity) =>
          hasActivityParticipant(stand, activityUserIds[activity]),
        )
      ) {
        continue;
      }
      matching.push(stand.id);
    }
  }

  return matching;
}

export type ParticipantSort = "stand" | "name";

function compareStands(
  a: PublicFestivalParticipant["stands"][number],
  b: PublicFestivalParticipant["stands"][number],
) {
  // Same convention as formatStandLabel: a stand with no letter is just its
  // number, so it sorts ahead of every lettered one.
  return (
    (a.label ?? "").localeCompare(b.label ?? "", "es") ||
    a.standNumber - b.standNumber
  );
}

/**
 * A participant can hold several stands; the earliest one places them, so
 * someone walking the aisles in order meets them where the list says.
 */
function firstStand(participant: PublicFestivalParticipant) {
  return [...participant.stands].sort(compareStands)[0];
}

function compareByName(
  a: PublicFestivalParticipant,
  b: PublicFestivalParticipant,
) {
  return a.displayName.localeCompare(b.displayName, "es");
}

function compareByStand(
  a: PublicFestivalParticipant,
  b: PublicFestivalParticipant,
) {
  const aStand = firstStand(a);
  const bStand = firstStand(b);

  // Anyone without a stand yet sorts last rather than ahead of stand A1.
  if (!aStand || !bStand) {
    if (aStand) return -1;
    if (bStand) return 1;
    return compareByName(a, b);
  }

  return compareStands(aStand, bStand) || compareByName(a, b);
}

export function sortFestivalParticipants(
  participants: PublicFestivalParticipant[],
  sort: ParticipantSort,
): PublicFestivalParticipant[] {
  return [...participants].sort(
    sort === "name" ? compareByName : compareByStand,
  );
}

export function participantSearchEntryMatchesFilters(
  entry: ParticipantSearchEntry,
  query: string,
  category: ParticipantCategoryFilter,
) {
  if (category !== "all" && entry.category !== category) return false;

  const normalizedQuery = normalizeParticipantSearch(query.trim());
  if (!normalizedQuery) return true;

  return [
    entry.displayName,
    entry.standLabel,
    getPublicCategoryLabel(entry.category),
  ].some((field) => !!field && fieldMatchesQuery(field, normalizedQuery));
}

/**
 * Stands the map should keep lit, or null when nothing is filtered.
 *
 * Status is a property of the stand itself, so it is resolved over the sectors;
 * every other filter describes a participant and can only match stands that
 * host one. A stand must satisfy both halves.
 */
export function getMatchingStandIds({
  sectors,
  searchEntries,
  query,
  category,
  standFilters,
  activityUserIds,
}: {
  sectors: FestivalSectorWithStandsWithReservationsWithParticipants[];
  searchEntries: ParticipantSearchEntry[];
  query: string;
  category: ParticipantCategoryFilter;
  standFilters: StandFilters;
  activityUserIds: StandActivityUserIds;
}): number[] | null {
  // Only the legend is on: resolve it over the stands themselves, with the
  // same occupant rule the badges are drawn with, so every stand showing a
  // selected marker stays lit.
  if (query.trim().length === 0 && category === "all") {
    return getStandFilterMatchingStandIds({
      sectors,
      standFilters,
      activityUserIds,
    });
  }

  // A text or category filter describes a named participant, so it can only
  // go through the search entries.
  const filtersStatus = standFilters.status !== "all";
  const matching = new Set<number>();

  for (const entry of searchEntries) {
    if (!participantSearchEntryMatchesFilters(entry, query, category)) continue;
    if (
      !matchesStandActivityFilters(
        entry.userId,
        standFilters.activities,
        activityUserIds,
      )
    ) {
      continue;
    }
    if (
      filtersStatus &&
      !matchesStandStatusFilter(entry.stand, standFilters.status)
    ) {
      continue;
    }
    matching.add(entry.stand.id);
  }

  return Array.from(matching);
}

/**
 * Counted over what the map is actually drawing, so the number tracks the
 * sector the visitor is looking at. -1 is every sector.
 */
export function countShownStands(
  sectors: FestivalSectorWithStandsWithReservationsWithParticipants[],
  activeSectorIndex: number,
  matchingStandIds: number[] | null,
): { shown: number; total: number } {
  const scopedSectors =
    activeSectorIndex === -1
      ? sectors
      : [sectors[activeSectorIndex]].filter(Boolean);
  const scopedStandIds = scopedSectors.flatMap((sector) =>
    sector.stands
      .filter((stand) => stand.status !== "disabled")
      .map((stand) => stand.id),
  );

  if (matchingStandIds == null) {
    return { shown: scopedStandIds.length, total: scopedStandIds.length };
  }

  const matchingStandIdSet = new Set(matchingStandIds);
  return {
    shown: scopedStandIds.filter((standId) => matchingStandIdSet.has(standId))
      .length,
    total: scopedStandIds.length,
  };
}
