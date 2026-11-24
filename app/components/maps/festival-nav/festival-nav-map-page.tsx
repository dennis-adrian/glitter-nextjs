"use client";

import { useMemo, useState } from "react";

import FestivalVisitorFilterSummary from "@/app/components/festivals/festival-visitor-filter-summary";
import {
  countShownStands,
  getMatchingStandIds,
} from "@/app/components/festivals/festival-visitor-filters";
import FestivalNavMap from "@/app/components/maps/festival-nav/festival-nav-map";
import { buildParticipantSearchEntries } from "@/app/components/maps/festival-nav/festival-nav-participant-search";
import type { CouponProof } from "@/app/components/maps/festival-nav/festival-nav-stand-drawer";
import {
  useInitialFestivalMapUrlState,
  useSyncFestivalMapUrl,
} from "@/app/hooks/use-festival-map-url-state";
import type { FestivalSectorWithStandsWithReservationsWithParticipants } from "@/app/lib/festival_sectors/definitions";
import type { FestivalActivity } from "@/app/lib/festivals/definitions";
import {
  EMPTY_STAND_FILTERS,
  getSelectableStandActivities,
  getSelectableStandStatuses,
  hasActiveStandFilters,
  type StandActivityUserIds,
  type StandFilters,
} from "@/app/lib/maps/stand-filters";

type FestivalNavMapPageProps = {
  festivalName: string;
  sectors: FestivalSectorWithStandsWithReservationsWithParticipants[];
  activityUserIds: StandActivityUserIds;
  couponBookProofs: Record<number, CouponProof[]>;
  activityTypes: FestivalActivity["type"][];
};

/**
 * The dedicated map page: the map with the legend's filters, both kept in the
 * URL so a filtered view can be shared. The search here only locates a
 * participant, so unlike the festival page there is no `q` to keep.
 */
export default function FestivalNavMapPage({
  festivalName,
  sectors,
  activityUserIds,
  couponBookProofs,
  activityTypes,
}: FestivalNavMapPageProps) {
  const selectableActivities = useMemo(
    () => getSelectableStandActivities(activityTypes, activityUserIds),
    [activityTypes, activityUserIds],
  );
  const selectableStatuses = useMemo(
    () =>
      getSelectableStandStatuses(sectors.flatMap((sector) => sector.stands)),
    [sectors],
  );
  const initialUrlState = useInitialFestivalMapUrlState({
    sectors,
    selectableStatuses,
    selectableActivities,
    includeQuery: false,
  });

  const [activeSectorIndex, setActiveSectorIndex] = useState(
    initialUrlState.sectorIndex,
  );
  const [standFilters, setStandFilters] = useState<StandFilters>(
    initialUrlState.standFilters,
  );

  const searchEntries = useMemo(
    () => buildParticipantSearchEntries(sectors),
    [sectors],
  );
  const matchingStandIds = useMemo(
    () =>
      getMatchingStandIds({
        sectors,
        searchEntries,
        query: "",
        category: "all",
        standFilters,
        activityUserIds,
      }),
    [activityUserIds, searchEntries, sectors, standFilters],
  );
  const standCounts = useMemo(
    () => countShownStands(sectors, activeSectorIndex, matchingStandIds),
    [activeSectorIndex, matchingStandIds, sectors],
  );

  useSyncFestivalMapUrl(
    { query: "", sectorIndex: activeSectorIndex, standFilters },
    { sectors, includeQuery: false },
  );

  return (
    <FestivalNavMap
      festivalName={festivalName}
      sectors={sectors}
      activityUserIds={activityUserIds}
      couponBookProofs={couponBookProofs}
      activityTypes={activityTypes}
      activeSectorIndex={activeSectorIndex}
      onActiveSectorIndexChange={setActiveSectorIndex}
      matchingStandIds={matchingStandIds}
      standFilters={standFilters}
      onStandFiltersChange={setStandFilters}
      selectableStatuses={selectableStatuses}
      selectableActivities={selectableActivities}
      filterSummary={
        <FestivalVisitorFilterSummary
          shownStandCount={standCounts.shown}
          totalStandCount={standCounts.total}
          hasActiveFilters={hasActiveStandFilters(standFilters)}
          onClear={() => setStandFilters(EMPTY_STAND_FILTERS)}
        />
      }
    />
  );
}
