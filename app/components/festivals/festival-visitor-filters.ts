import type { ParticipantCategoryFilter } from "@/app/components/festivals/festival-participant-category-filters";
import type { PublicFestivalParticipant } from "@/app/components/festivals/participant-info";
import {
  normalizeParticipantSearch,
  type ParticipantSearchEntry,
} from "@/app/components/maps/festival-nav/festival-nav-participant-search";
import { getPublicCategoryLabel } from "@/app/lib/maps/helpers";
import { formatStandLabel } from "@/app/lib/stands/helpers";

function participantMatchesQuery(
  participant: PublicFestivalParticipant,
  normalizedQuery: string,
) {
  if (!normalizedQuery) return true;

  const searchable = normalizeParticipantSearch(
    [
      participant.displayName,
      participant.stands.map(formatStandLabel).join(" "),
      getPublicCategoryLabel(participant.category),
    ]
      .filter(Boolean)
      .join(" "),
  );

  return searchable.includes(normalizedQuery);
}

export function filterFestivalParticipants({
  participants,
  query,
  category,
  sectorStandIds,
}: {
  participants: PublicFestivalParticipant[];
  query: string;
  category: ParticipantCategoryFilter;
  sectorStandIds?: ReadonlySet<number>;
}) {
  const normalizedQuery = normalizeParticipantSearch(query.trim());

  return [...participants]
    .filter((participant) => {
      if (category !== "all" && participant.category !== category) {
        return false;
      }
      if (
        sectorStandIds &&
        !participant.stands.some((stand) => sectorStandIds.has(stand.id))
      ) {
        return false;
      }
      return participantMatchesQuery(participant, normalizedQuery);
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "es"));
}

export function participantSearchEntryMatchesFilters(
  entry: ParticipantSearchEntry,
  query: string,
  category: ParticipantCategoryFilter,
) {
  if (category !== "all" && entry.category !== category) return false;

  const normalizedQuery = normalizeParticipantSearch(query.trim());
  if (!normalizedQuery) return true;

  return normalizeParticipantSearch(
    [
      entry.displayName,
      entry.standLabel,
      getPublicCategoryLabel(entry.category),
    ]
      .filter(Boolean)
      .join(" "),
  ).includes(normalizedQuery);
}
