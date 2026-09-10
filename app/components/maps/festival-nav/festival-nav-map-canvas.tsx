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
import MapSurface from "@/app/components/maps/map-surface";
import MapToolbar from "@/app/components/maps/map-toolbar";
import { cn } from "@/app/lib/utils";
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

type FestivalNavMapCanvasProps = {
  stands: StandWithReservationsWithParticipants[];
  mapElements: MapElementBase[];
  mapBounds?: MapBounds;
  selectedStandId: number | null;
  locateRequest?: { standId: number; requestId: number } | null;
  matchingStandIds?: number[] | null;
  activityUserIds: StandActivityUserIds;
  sectorName: string;
  /**
   * Shown beside the zoom controls. Passed in rather than rendered by the
   * caller so the name and the controls share one row: they are the same
   * header, and stacking them cost a strip of vertical space on a page that is
   * mostly map.
   */
  sectorLabel?: string;
  /**
   * Heading level for `sectorLabel`. The standalone map puts an `h1` above
   * these, so 2 is right there; the explorer embeds the map under its own
   * section heading, where 3 keeps the outline nested instead of flat. The
   * canvas takes the level rather than a flag, so it never has to know which
   * page it is on.
   */
  sectorHeadingLevel?: 2 | 3;
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
  sectorLabel,
  sectorHeadingLevel = 2,
  onStandSelect,
}: FestivalNavMapCanvasProps) {
  const SectorHeading = `h${sectorHeadingLevel}` as const;
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

      // Back to the resting view rather than zoomed in on the hit: the whole
      // sector fits at this scale, so the stand is legible where it stands and
      // the visitor keeps the surroundings they need to walk to it.
      transformRef.current?.resetTransform(duration, "easeOut");
    }, 50);

    return () => window.clearTimeout(timer);
  }, [locateRequest, visibleStands]);

  return (
    <div
      ref={containerRef}
      className="w-full"
      style={{
        // Set from the real height of sticky controls (explorer or standalone
        // map). The fallback is for callers that have none.
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
        {/* Above the frame rather than floating over it, as the admin map does:
            the visitor's own stand can sit anywhere on the canvas, and controls
            overlaying a corner would cover somebody's space. The sector name
            shares the row; the rule under it is what separates one sector from
            the next when they are listed together. */}
        <div
          className={cn(
            "flex w-full items-center gap-2 pb-2",
            sectorLabel && "mb-2 border-b px-4 pt-2",
          )}
        >
          {/* A heading, not a paragraph: in the all-sectors view this titles
              each sector's map, and heading navigation is how a screen reader
              user moves between them. */}
          {sectorLabel && (
            <SectorHeading className="text-lg font-semibold text-muted-foreground">
              {sectorLabel}
            </SectorHeading>
          )}
          <div className="ml-auto">
            <MapToolbar />
          </div>
        </div>

        <div className="relative w-full overflow-hidden rounded-lg border">
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
        </div>
      </MapTransformWrapper>
    </div>
  );
}
