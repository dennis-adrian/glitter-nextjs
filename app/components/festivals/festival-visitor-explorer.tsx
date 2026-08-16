"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { ParticipantCategoryFilter } from "@/app/components/festivals/festival-participant-category-filters";
import FestivalVisitorFilterSummary from "@/app/components/festivals/festival-visitor-filter-summary";
import {
  filterFestivalParticipants,
  getMatchingStandIds,
} from "@/app/components/festivals/festival-visitor-filters";
import type { PublicFestivalParticipant } from "@/app/components/festivals/participant-info";
import PublicFestivalActivities, {
  type VisitorActivity,
} from "@/app/components/festivals/public-festival-activities";
import PublicFestivalParticipants from "@/app/components/festivals/public-festival-participants";
import FestivalNavMap from "@/app/components/maps/festival-nav/festival-nav-map";
import FestivalNavMapLegend from "@/app/components/maps/festival-nav/festival-nav-map-legend";
import {
  buildParticipantSearchEntries,
  type ParticipantSearchEntry,
} from "@/app/components/maps/festival-nav/festival-nav-participant-search";
import FestivalNavSearch from "@/app/components/maps/festival-nav/festival-nav-search";
import FestivalNavSectorTabs from "@/app/components/maps/festival-nav/festival-nav-sector-tabs";
import type { CouponProof } from "@/app/components/maps/festival-nav/festival-nav-stand-drawer";
import type { FestivalSectorWithStandsWithReservationsWithParticipants } from "@/app/lib/festival_sectors/definitions";
import type { FestivalActivity } from "@/app/lib/festivals/definitions";
import {
  EMPTY_STAND_FILTERS,
  hasActiveStandFilters,
  isStandActivityFilter,
  isStandOccupied,
  type StandActivityFilter,
  type StandActivityUserIds,
  type StandFilters,
  type StandStatusFilter,
} from "@/app/lib/maps/stand-filters";

type MapActivityData = {
  activityUserIds: StandActivityUserIds;
  couponBookProofs: Record<number, CouponProof[]>;
  activityTypes: FestivalActivity["type"][];
};

type ParticipantLocateRequest = {
  userId: number;
  standId: number;
  requestId: number;
};

export default function FestivalVisitorExplorer({
  festivalName,
  sectors,
  participants,
  activities,
  mapActivityData,
}: {
  festivalName: string;
  sectors: FestivalSectorWithStandsWithReservationsWithParticipants[];
  participants: PublicFestivalParticipant[];
  activities: VisitorActivity[];
  mapActivityData: MapActivityData;
}) {
  const [query, setQuery] = useState("");
  // Category filtering is built and tested but hidden for now; the state stays
  // so restoring the control is a matter of rendering it again.
  const [category] = useState<ParticipantCategoryFilter>("all");
  const [standFilters, setStandFilters] =
    useState<StandFilters>(EMPTY_STAND_FILTERS);
  const [activeSectorIndex, setActiveSectorIndex] = useState(-1);
  const [participantLocateRequest, setParticipantLocateRequest] =
    useState<ParticipantLocateRequest | null>(null);
  const locateRequestId = useRef(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const stickyControlsRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);

  // The controls sit above the map and stay there while it scrolls, so
  // anything scrolling a stand into view has to clear them. Measured rather
  // than hardcoded: the bar grows and shrinks with the sector tabs, the legend
  // and the filter summary.
  useEffect(() => {
    const controls = stickyControlsRef.current;
    const root = rootRef.current;
    if (!controls || !root) return;

    const updateScrollOffset = () => {
      const stickyTop = Number.parseFloat(
        window.getComputedStyle(controls).top,
      );

      root.style.setProperty(
        "--festival-map-scroll-offset",
        `${(Number.isNaN(stickyTop) ? 0 : stickyTop) + controls.offsetHeight + 12}px`,
      );
    };

    updateScrollOffset();

    const observer = new ResizeObserver(updateScrollOffset);
    observer.observe(controls);
    window.addEventListener("resize", updateScrollOffset);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateScrollOffset);
    };
  }, []);

  const searchEntries = useMemo(
    () => buildParticipantSearchEntries(sectors),
    [sectors],
  );
  const visibleSearchEntries = useMemo(
    () =>
      searchEntries.filter(
        (entry) => category === "all" || entry.category === category,
      ),
    [category, searchEntries],
  );
  // A festival can run an activity nobody has an approved proof for yet. The
  // chip still shows — the festival does run that activity — but it cannot be
  // selected, since no stand carries the badge to filter on.
  const selectableActivities = useMemo(
    () =>
      mapActivityData.activityTypes.filter(
        (type): type is StandActivityFilter =>
          isStandActivityFilter(type) &&
          mapActivityData.activityUserIds[type].size > 0,
      ),
    [mapActivityData],
  );
  // Same reasoning for stand status: a sold-out festival has no free stand to
  // show, so "Disponible" stays a color key rather than an empty filter.
  const selectableStatuses = useMemo(() => {
    const statuses: Exclude<StandStatusFilter, "all">[] = [];
    const stands = sectors.flatMap((sector) => sector.stands);

    if (stands.some((stand) => isStandOccupied(stand)))
      statuses.push("occupied");
    if (stands.some((stand) => stand.status === "available")) {
      statuses.push("available");
    }

    return statuses;
  }, [sectors]);
  // -1 is "all sectors": leave the list unscoped so query/category still
  // apply and confirmed participants without a stand stay visible.
  const activeSectorStandIds = useMemo(() => {
    if (activeSectorIndex === -1) return undefined;
    const activeSector = sectors[activeSectorIndex];
    if (!activeSector) return undefined;
    return new Set(activeSector.stands.map((stand) => stand.id));
  }, [activeSectorIndex, sectors]);
  const filteredParticipants = useMemo(
    () =>
      filterFestivalParticipants({
        participants,
        query,
        category,
        sectorStandIds: activeSectorStandIds,
        activities: standFilters.activities,
        activityUserIds: mapActivityData.activityUserIds,
      }),
    [
      activeSectorStandIds,
      mapActivityData,
      category,
      participants,
      query,
      standFilters.activities,
    ],
  );
  const matchingStandIds = useMemo(
    () =>
      getMatchingStandIds({
        sectors,
        searchEntries,
        query,
        category,
        standFilters,
        activityUserIds: mapActivityData.activityUserIds,
      }),
    [mapActivityData, category, query, searchEntries, sectors, standFilters],
  );
  // Counted over what the map is actually drawing, so the number tracks the
  // sector the visitor is looking at.
  const standCounts = useMemo(() => {
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
  }, [activeSectorIndex, matchingStandIds, sectors]);

  const hasActiveFilters =
    query.trim().length > 0 ||
    category !== "all" ||
    hasActiveStandFilters(standFilters);

  function handleSearchSelect(entry: ParticipantSearchEntry) {
    locateRequestId.current += 1;
    setQuery(entry.displayName);
    // Follow the hit only from a single-sector tab. Someone looking at every
    // sector chose that view, and it is the one that shows where the stand
    // sits relative to the rest of the venue.
    if (activeSectorIndex !== -1) setActiveSectorIndex(entry.sectorIndex);
    setParticipantLocateRequest({
      userId: entry.userId,
      standId: entry.stand.id,
      requestId: locateRequestId.current,
    });
  }

  function handleQueryChange(nextQuery: string) {
    setQuery(nextQuery);
    setParticipantLocateRequest(null);
  }

  function handleStandFiltersChange(nextStandFilters: StandFilters) {
    setStandFilters(nextStandFilters);
    setParticipantLocateRequest(null);
  }

  // Switching sectors swaps the whole map underneath the reader; without this
  // they stay at whatever depth the previous sector reached and land partway
  // into a drawing they have not seen the top of.
  function scrollMapIntoView() {
    const map = mapRef.current;
    if (!map) return;

    const controlsBottom =
      stickyControlsRef.current?.getBoundingClientRect().bottom ?? 0;
    // Already looking at the top of the map: leave their scroll alone.
    if (map.getBoundingClientRect().top >= controlsBottom) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    // Deferred so the incoming sector has laid out before we scroll to it,
    // matching how the canvas defers its own locate scroll.
    window.setTimeout(
      () =>
        map.scrollIntoView({
          behavior: reduceMotion ? "auto" : "smooth",
          block: "start",
        }),
      50,
    );
  }

  function handleSectorChange(nextSectorIndex: number) {
    setActiveSectorIndex(nextSectorIndex);
    setParticipantLocateRequest(null);
    scrollMapIntoView();
  }

  // Coming from an activity card the intent is "show me these stands", so this
  // replaces the other filters instead of narrowing on top of them, and opens
  // every sector so no marked stand stays hidden behind a tab.
  function handleFilterByActivity(activity: StandActivityFilter) {
    setQuery("");
    setStandFilters({ status: "all", activities: [activity] });
    setActiveSectorIndex(-1);
    setParticipantLocateRequest(null);
  }

  function handleClearFilters() {
    setQuery("");
    setStandFilters(EMPTY_STAND_FILTERS);
    setParticipantLocateRequest(null);
  }

  return (
    <div className="relative" ref={rootRef}>
      <div className="max-w-2xl">
        <h2 className="font-space-grotesk text-3xl font-bold tracking-tight sm:text-4xl">
          Mapa y participantes
        </h2>
        <p className="mt-2 text-sm text-muted-foreground sm:text-base">
          Buscá un participante, ubicá su stand y reconocé las actividades por
          sus marcadores en el mapa.
        </p>
      </div>

      <div
        ref={stickyControlsRef}
        className="sticky top-16 z-30 -mx-4 mt-6 space-y-1 border-y bg-background/95 px-4 py-2 shadow-sm backdrop-blur-md sm:mx-0 sm:rounded-xl sm:border md:top-20"
      >
        <FestivalNavSearch
          entries={visibleSearchEntries}
          value={query}
          onValueChange={handleQueryChange}
          onSelect={handleSearchSelect}
          flush
        />
        {sectors.length > 0 ? (
          <FestivalNavSectorTabs
            sectors={sectors}
            activeIndex={activeSectorIndex}
            onChange={handleSectorChange}
            allLabel="Todos los sectores"
            flush
          />
        ) : null}
        <div className="border-t pt-2">
          <FestivalNavMapLegend
            activityTypes={mapActivityData.activityTypes}
            filters={standFilters}
            onFiltersChange={handleStandFiltersChange}
            selectableStatuses={selectableStatuses}
            selectableActivities={selectableActivities}
          />
        </div>
        <FestivalVisitorFilterSummary
          shownStandCount={standCounts.shown}
          totalStandCount={standCounts.total}
          hasActiveFilters={hasActiveFilters}
          onClear={handleClearFilters}
        />
      </div>

      <div
        ref={mapRef}
        className="mt-6"
        style={{ scrollMarginTop: "var(--festival-map-scroll-offset, 6rem)" }}
      >
        {sectors.length > 0 ? (
          <FestivalNavMap
            embedded
            showControls={false}
            festivalName={festivalName}
            sectors={sectors}
            activeSectorIndex={activeSectorIndex}
            onActiveSectorIndexChange={handleSectorChange}
            participantLocateRequest={participantLocateRequest}
            matchingStandIds={matchingStandIds}
            {...mapActivityData}
          />
        ) : (
          <div className="rounded-2xl border border-dashed bg-muted/30 px-6 py-12 text-center">
            <p className="font-semibold">El mapa estará disponible pronto.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Los sectores aparecerán cuando se publique la distribución.
            </p>
          </div>
        )}
      </div>

      <section
        id="participantes"
        tabIndex={-1}
        className="mt-16 scroll-mt-56 space-y-6 sm:mt-20"
      >
        <div className="max-w-2xl">
          <h2 className="font-space-grotesk text-3xl font-bold tracking-tight sm:text-4xl">
            Participantes
          </h2>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">
            Los resultados siguen la búsqueda, la categoría, el sector y las
            actividades del mapa.
          </p>
        </div>

        <PublicFestivalParticipants participants={filteredParticipants} />
      </section>

      <div className="mt-16 sm:mt-20">
        <PublicFestivalActivities
          activities={activities}
          onFilterByActivity={handleFilterByActivity}
        />
      </div>
    </div>
  );
}
