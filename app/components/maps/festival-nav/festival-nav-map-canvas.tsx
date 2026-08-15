"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  TransformComponent,
  type ReactZoomPanPinchRef,
} from "react-zoom-pan-pinch";

import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import { MapElementBase } from "@/app/lib/map_elements/definitions";
import { MapBounds } from "@/app/components/maps/map-types";
import {
  StandColors,
  getExternalParticipantStandColors,
  getPublicStandColors,
} from "@/app/components/maps/map-utils";
import MapPinchHint from "@/app/components/maps/map-pinch-hint";
import MapSurface from "@/app/components/maps/map-surface";
import MapTransformWrapper from "@/app/components/maps/map-transform-wrapper";
import FestivalNavStandBadges from "@/app/components/maps/festival-nav/festival-nav-stand-badges";
import { hasExternalParticipants } from "@/app/components/maps/map-participants";
import {
  isStandOccupied,
  type StandActivityUserIds,
} from "@/app/lib/maps/stand-filters";
import {
  dedupeJointGroupMembers,
  resolveJointGroups,
} from "@/app/lib/stands/groups";

/** Close enough to read the stand label without losing its neighbours. */
const LOCATE_SCALE = 2;

type FestivalNavMapCanvasProps = {
  stands: StandWithReservationsWithParticipants[];
  mapElements: MapElementBase[];
  mapBounds?: MapBounds;
  selectedStandId: number | null;
  locateRequest?: { standId: number; requestId: number } | null;
  matchingStandIds?: number[] | null;
  activityUserIds: StandActivityUserIds;
  sectorName: string;
  onStandSelect: (
    stand: StandWithReservationsWithParticipants,
    sectorName: string,
  ) => void;
};

export function getNavStandColors(
  stand: StandWithReservationsWithParticipants,
): StandColors {
  if (!isStandOccupied(stand)) return getPublicStandColors(stand.status);
  if (hasExternalParticipants(stand))
    return getExternalParticipantStandColors();
  return getPublicStandColors(stand.status);
}

export default function FestivalNavMapCanvas({
  stands,
  mapElements,
  mapBounds,
  selectedStandId,
  locateRequest,
  matchingStandIds,
  activityUserIds,
  sectorName,
  onStandSelect,
}: FestivalNavMapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef<ReactZoomPanPinchRef>(null);
  const visibleStands = useMemo(
    () => stands.filter((s) => s.status !== "disabled"),
    [stands],
  );
  const jointGroups = useMemo(
    () => resolveJointGroups(visibleStands),
    [visibleStands],
  );
  const dimmedStandIdSet = useMemo(() => {
    if (matchingStandIds == null) return undefined;

    const matchingStandIdSet = new Set(matchingStandIds);
    for (const group of jointGroups) {
      if (group.stands.some((stand) => matchingStandIdSet.has(stand.id))) {
        group.stands.forEach((stand) => matchingStandIdSet.add(stand.id));
      }
    }

    return new Set(
      visibleStands
        .filter((stand) => !matchingStandIdSet.has(stand.id))
        .map((stand) => stand.id),
    );
  }, [jointGroups, matchingStandIds, visibleStands]);
  // Resolved from the same list MapSurface draws, so a group that renders as
  // one outline carries exactly one set of activity badges.
  const occupiedStands = useMemo(
    () =>
      dedupeJointGroupMembers(
        visibleStands.filter(isStandOccupied),
        jointGroups,
      ),
    [jointGroups, visibleStands],
  );

  const handleStandSelect = useCallback(
    (stand: StandWithReservationsWithParticipants) => {
      if (!isStandOccupied(stand)) return;
      onStandSelect(stand, sectorName);
    },
    [onStandSelect, sectorName],
  );

  useEffect(() => {
    if (!locateRequest) return;
    if (!visibleStands.some((stand) => stand.id === locateRequest.standId)) {
      return;
    }

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const duration = reduceMotion ? 0 : 300;
    const timer = window.setTimeout(() => {
      // Aligned to the top rather than centred: the controls above the map are
      // sticky, and centring the container slides its upper rows underneath
      // them. scroll-margin-top carries the height they occupy.
      containerRef.current?.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "start",
      });

      // Bring the stand to the middle of the canvas too. Resetting the
      // transform only restored the default view, which on a large sector
      // leaves the located stand wherever it happened to fall.
      const standNode = document.getElementById(
        `festival-map-stand-${locateRequest.standId}`,
      );

      if (standNode) {
        transformRef.current?.zoomToElement(
          standNode as unknown as HTMLElement,
          LOCATE_SCALE,
          duration,
          "easeOut",
        );
      } else {
        transformRef.current?.resetTransform(duration, "easeOut");
      }
    }, 50);

    return () => window.clearTimeout(timer);
  }, [locateRequest, visibleStands]);

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded-lg border"
      style={{
        // Set by the explorer from the real height of its sticky controls; the
        // fallback covers the standalone map page, which has none.
        scrollMarginTop: "var(--festival-map-scroll-offset, 6rem)",
      }}
    >
      <MapTransformWrapper
        ref={transformRef}
        initialScale={1}
        minScale={1}
        maxScale={4}
        centerOnInit
      >
        <TransformComponent
          wrapperStyle={{ width: "100%" }}
          contentStyle={{ width: "100%" }}
        >
          <MapSurface
            stands={visibleStands}
            mapElements={mapElements}
            mapBounds={mapBounds}
            selectedStandId={selectedStandId}
            highlightedStandId={locateRequest?.standId}
            highlightRequestId={locateRequest?.requestId}
            dimmedStandIds={dimmedStandIdSet}
            getColors={getNavStandColors}
            onStandClick={handleStandSelect}
            onStandTouchTap={handleStandSelect}
          >
            <FestivalNavStandBadges
              stands={occupiedStands}
              activityUserIds={activityUserIds}
              dimmedStandIds={dimmedStandIdSet}
            />
          </MapSurface>
        </TransformComponent>

        <MapPinchHint className="bottom-12 pointer-events-none" />
      </MapTransformWrapper>
    </div>
  );
}
