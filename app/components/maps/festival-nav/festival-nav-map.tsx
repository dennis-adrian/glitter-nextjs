"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import { FestivalSectorWithStandsWithReservationsWithParticipants } from "@/app/lib/festival_sectors/definitions";
import FestivalNavSectorTabs from "@/app/components/maps/festival-nav/festival-nav-sector-tabs";
import FestivalNavMapCanvas from "@/app/components/maps/festival-nav/festival-nav-map-canvas";
import FestivalNavSearch, {
  ParticipantSearchEntry,
} from "@/app/components/maps/festival-nav/festival-nav-search";
import FestivalNavStandDrawer, {
  CouponProof,
} from "@/app/components/maps/festival-nav/festival-nav-stand-drawer";
import FestivalNavMapLegend from "@/app/components/maps/festival-nav/festival-nav-map-legend";
import type { FestivalActivity } from "@/app/lib/festivals/definitions";
import { formatStandLabel } from "@/app/lib/stands/helpers";
import {
  indexJointGroupsByStandId,
  resolveJointGroups,
} from "@/app/lib/stands/groups";
import { cn } from "@/app/lib/utils";

type FestivalNavMapProps = {
  festivalName: string;
  sectors: FestivalSectorWithStandsWithReservationsWithParticipants[];
  couponBookUserIds: number[];
  couponBookProofs: Record<number, CouponProof[]>;
  passportUserIds: number[];
  stickerHuntUserIds: number[];
  activityTypes: FestivalActivity["type"][];
  embedded?: boolean;
};

export default function FestivalNavMap({
  festivalName,
  sectors,
  couponBookUserIds,
  couponBookProofs,
  passportUserIds,
  stickerHuntUserIds,
  activityTypes,
  embedded = false,
}: FestivalNavMapProps) {
  // The embedded page starts compact; the dedicated map keeps its all-sector
  // overview.
  const [activeSectorIndex, setActiveSectorIndex] = useState(embedded ? 0 : -1);
  const [selectedStand, setSelectedStand] =
    useState<StandWithReservationsWithParticipants | null>(null);
  const [selectedSectorName, setSelectedSectorName] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [locateRequest, setLocateRequest] = useState<{
    standId: number;
    requestId: number;
  } | null>(null);

  const locateRequestId = useRef(0);

  const couponBookUserIdSet = useMemo(
    () => new Set(couponBookUserIds),
    [couponBookUserIds],
  );

  const passportUserIdSet = useMemo(
    () => new Set(passportUserIds),
    [passportUserIds],
  );

  const stickerHuntUserIdSet = useMemo(
    () => new Set(stickerHuntUserIds),
    [stickerHuntUserIds],
  );

  // Build participant search index across all sectors
  const searchEntries = useMemo<ParticipantSearchEntry[]>(() => {
    const entries: ParticipantSearchEntry[] = [];
    sectors.forEach((sector, sectorIndex) => {
      sector.stands.forEach((stand) => {
        if (stand.status === "disabled") return;
        const standLabel = formatStandLabel(stand);
        stand.reservations
          .filter((r) => r.status !== "rejected")
          .flatMap((r) => r.participants)
          .forEach((participant) => {
            if (!participant.user.displayName) return;
            entries.push({
              displayName: participant.user.displayName,
              imageUrl: participant.user.imageUrl,
              standLabel,
              sectorName: sector.name,
              sectorIndex,
              stand,
            });
          });
      });
    });
    return entries;
  }, [sectors]);

  // Built from the same stands the canvases draw, so the drawer always
  // describes the unit the visitor sees. Covers search hits too, which never
  // pass through the map's own tap handler.
  const jointGroupByStandId = useMemo(
    () =>
      indexJointGroupsByStandId(
        resolveJointGroups(
          sectors.flatMap((sector) =>
            sector.stands.filter((stand) => stand.status !== "disabled"),
          ),
        ),
      ),
    [sectors],
  );

  const handleStandSelect = useCallback(
    (stand: StandWithReservationsWithParticipants, sectorName: string) => {
      setSelectedStand(stand);
      setSelectedSectorName(sectorName);
      setLocateRequest(null);
      setDrawerOpen(true);
    },
    [],
  );

  const handleSearchSelect = useCallback((entry: ParticipantSearchEntry) => {
    locateRequestId.current += 1;
    setSelectedStand(entry.stand);
    setSelectedSectorName(entry.sectorName);
    setLocateRequest({
      standId: entry.stand.id,
      requestId: locateRequestId.current,
    });
    setDrawerOpen(false);
    setActiveSectorIndex(entry.sectorIndex);
  }, []);

  const handleSectorChange = useCallback((sectorIndex: number) => {
    setActiveSectorIndex(sectorIndex);
    setSelectedStand(null);
    setLocateRequest(null);
    setDrawerOpen(false);
  }, []);

  const showAll = activeSectorIndex === -1;
  const activeSector = showAll ? null : (sectors[activeSectorIndex] ?? null);

  const getSectorMapBounds = (
    sector: FestivalSectorWithStandsWithReservationsWithParticipants,
  ) =>
    sector.mapOriginX != null &&
    sector.mapOriginY != null &&
    sector.mapWidth != null &&
    sector.mapHeight != null
      ? {
          minX: sector.mapOriginX,
          minY: sector.mapOriginY,
          width: sector.mapWidth,
          height: sector.mapHeight,
        }
      : undefined;

  return (
    <div
      className={cn(
        "flex flex-col",
        embedded ? "w-full gap-3" : "container gap-4 py-4",
      )}
    >
      {/* Compact header */}
      {!embedded ? (
        <div className="px-4">
          <h1 className="truncate text-base font-semibold">{festivalName}</h1>
          <p className="text-xs text-muted-foreground">Mapa del festival</p>
        </div>
      ) : null}

      {/* Search + tabs — sticky below navbar */}
      <div
        className={cn(
          "z-20 border-b bg-background",
          embedded ? "relative" : "sticky top-16 md:top-20",
        )}
      >
        <FestivalNavSearch
          entries={searchEntries}
          onSelect={handleSearchSelect}
          flush={embedded}
        />
        <FestivalNavSectorTabs
          sectors={sectors}
          activeIndex={activeSectorIndex}
          onChange={handleSectorChange}
          flush={embedded}
        />
      </div>

      {/* Legend */}
      <div
        className={cn(
          "flex justify-center",
          embedded ? "px-0" : "px-4 md:px-0",
        )}
      >
        <div className={cn("w-full", !embedded && "md:max-w-3xl")}>
          <FestivalNavMapLegend activityTypes={activityTypes} />
        </div>
      </div>

      {/* Map area */}
      <div
        className={cn(
          "flex justify-center",
          embedded ? "px-0" : "px-4 md:px-0",
        )}
      >
        <div className={cn("w-full", !embedded && "md:max-w-3xl")}>
          {showAll ? (
            <div className="flex flex-col gap-4">
              {sectors.map((sector) => (
                <div key={sector.id} className="scroll-mt-36 md:scroll-mt-40">
                  {sectors.length > 1 && (
                    <p className="px-4 py-2 text-sm font-semibold text-muted-foreground border-b">
                      {sector.name}
                    </p>
                  )}
                  <FestivalNavMapCanvas
                    stands={sector.stands}
                    mapElements={sector.mapElements ?? []}
                    mapBounds={getSectorMapBounds(sector)}
                    selectedStandId={selectedStand?.id ?? null}
                    locateRequest={locateRequest}
                    couponBookUserIdSet={couponBookUserIdSet}
                    passportUserIdSet={passportUserIdSet}
                    stickerHuntUserIdSet={stickerHuntUserIdSet}
                    sectorName={sector.name}
                    onStandSelect={handleStandSelect}
                  />
                </div>
              ))}
            </div>
          ) : activeSector ? (
            <FestivalNavMapCanvas
              key={activeSector.id}
              stands={activeSector.stands}
              mapElements={activeSector.mapElements ?? []}
              mapBounds={getSectorMapBounds(activeSector)}
              selectedStandId={selectedStand?.id ?? null}
              locateRequest={locateRequest}
              couponBookUserIdSet={couponBookUserIdSet}
              passportUserIdSet={passportUserIdSet}
              stickerHuntUserIdSet={stickerHuntUserIdSet}
              sectorName={activeSector.name}
              onStandSelect={handleStandSelect}
            />
          ) : (
            <p className="text-center text-muted-foreground text-sm py-8">
              No hay mapa disponible.
            </p>
          )}
        </div>
      </div>

      {/* Stand detail drawer */}
      <FestivalNavStandDrawer
        stand={selectedStand}
        sectorName={selectedSectorName}
        groupStands={
          selectedStand
            ? jointGroupByStandId.get(selectedStand.id)?.stands
            : undefined
        }
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        couponBookProofs={couponBookProofs}
        passportUserIdSet={passportUserIdSet}
        stickerHuntUserIdSet={stickerHuntUserIdSet}
      />
    </div>
  );
}
