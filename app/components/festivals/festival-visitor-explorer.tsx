"use client";

import { useMemo, useRef, useState } from "react";

import type { UserCategory } from "@/app/api/users/definitions";
import FestivalParticipantCategoryFilters, {
  type ParticipantCategoryFilter,
} from "@/app/components/festivals/festival-participant-category-filters";
import {
  filterFestivalParticipants,
  participantSearchEntryMatchesFilters,
} from "@/app/components/festivals/festival-visitor-filters";
import type { PublicFestivalParticipant } from "@/app/components/festivals/participant-info";
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
import { getPublicCategoryLabel } from "@/app/lib/maps/helpers";

type MapActivityData = {
  couponBookUserIds: number[];
  couponBookProofs: Record<number, CouponProof[]>;
  passportUserIds: number[];
  stickerHuntUserIds: number[];
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
  mapActivityData,
}: {
  festivalName: string;
  sectors: FestivalSectorWithStandsWithReservationsWithParticipants[];
  participants: PublicFestivalParticipant[];
  mapActivityData: MapActivityData;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ParticipantCategoryFilter>("all");
  const [activeSectorIndex, setActiveSectorIndex] = useState(
    sectors.length > 0 ? 0 : -1,
  );
  const [participantLocateRequest, setParticipantLocateRequest] =
    useState<ParticipantLocateRequest | null>(null);
  const locateRequestId = useRef(0);

  const categories = useMemo(
    () =>
      Array.from(
        new Set(
          participants
            .map((participant) => participant.category)
            .filter(
              (value): value is UserCategory =>
                getPublicCategoryLabel(value) != null,
            ),
        ),
      ),
    [participants],
  );
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
      }),
    [activeSectorStandIds, category, participants, query],
  );
  const matchingStandIds = useMemo(() => {
    const filtersMap = query.trim().length > 0 || category !== "all";
    if (!filtersMap) return null;

    return Array.from(
      new Set(
        searchEntries
          .filter((entry) =>
            participantSearchEntryMatchesFilters(entry, query, category),
          )
          .map((entry) => entry.stand.id),
      ),
    );
  }, [category, query, searchEntries]);

  function handleSearchSelect(entry: ParticipantSearchEntry) {
    locateRequestId.current += 1;
    setQuery(entry.displayName);
    setActiveSectorIndex(entry.sectorIndex);
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

  function handleCategoryChange(nextCategory: ParticipantCategoryFilter) {
    setCategory(nextCategory);
    setParticipantLocateRequest(null);
  }

  function handleSectorChange(nextSectorIndex: number) {
    setActiveSectorIndex(nextSectorIndex);
    setParticipantLocateRequest(null);
  }

  return (
    <div className="relative">
      <div className="max-w-2xl">
        <h2 className="font-space-grotesk text-3xl font-bold tracking-tight sm:text-4xl">
          Mapa y participantes
        </h2>
        <p className="mt-2 text-sm text-muted-foreground sm:text-base">
          Buscá un participante, ubicá su stand y reconocé las actividades por
          sus marcadores en el mapa.
        </p>
      </div>

      <div className="sticky top-16 z-30 -mx-4 mt-6 space-y-1 border-y bg-background/95 px-4 py-2 shadow-sm backdrop-blur-md sm:mx-0 sm:rounded-xl sm:border md:top-20">
        <FestivalNavSearch
          entries={visibleSearchEntries}
          value={query}
          onValueChange={handleQueryChange}
          onSelect={handleSearchSelect}
          flush
        />
        <FestivalParticipantCategoryFilters
          categories={categories}
          value={category}
          onChange={handleCategoryChange}
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
          <FestivalNavMapLegend activityTypes={mapActivityData.activityTypes} />
        </div>
      </div>

      <div className="mt-6">
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
            Los resultados siguen los mismos filtros del mapa.
          </p>
        </div>

        <PublicFestivalParticipants participants={filteredParticipants} />
      </section>
    </div>
  );
}
