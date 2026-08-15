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
import {
  hasActivityParticipant,
  hasExternalParticipants,
} from "@/app/components/maps/map-participants";
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
  couponBookUserIdSet: Set<number>;
  passportUserIdSet: Set<number>;
  stickerHuntUserIdSet: Set<number>;
  sectorName: string;
  onStandSelect: (
    stand: StandWithReservationsWithParticipants,
    sectorName: string,
  ) => void;
};

function isOccupied(stand: StandWithReservationsWithParticipants): boolean {
  return stand.status === "reserved" || stand.status === "confirmed";
}

function getNavStandColors(
  stand: StandWithReservationsWithParticipants,
  couponBookUserIdSet: Set<number>,
  passportUserIdSet: Set<number>,
  stickerHuntUserIdSet: Set<number>,
): StandColors {
  if (!isOccupied(stand)) return getPublicStandColors(stand.status);
  if (hasExternalParticipants(stand))
    return getExternalParticipantStandColors();

  if (hasActivityParticipant(stand, couponBookUserIdSet)) {
    return {
      fill: "rgba(217, 119, 6, 0.85)",
      hoverFill: "rgba(180, 83, 9, 0.95)",
      stroke: "rgba(146, 64, 14, 0.9)",
      text: "#ffffff",
    };
  }

  if (hasActivityParticipant(stand, passportUserIdSet)) {
    return {
      fill: "rgba(5, 150, 105, 0.85)",
      hoverFill: "rgba(4, 120, 87, 0.95)",
      stroke: "rgba(6, 95, 70, 0.9)",
      text: "#ffffff",
    };
  }

  if (hasActivityParticipant(stand, stickerHuntUserIdSet)) {
    return {
      fill: "rgba(219, 39, 119, 0.85)",
      hoverFill: "rgba(190, 24, 93, 0.95)",
      stroke: "rgba(157, 23, 77, 0.9)",
      text: "#ffffff",
    };
  }

  return getPublicStandColors(stand.status);
}

export default function FestivalNavMapCanvas({
  stands,
  mapElements,
  mapBounds,
  selectedStandId,
  locateRequest,
  couponBookUserIdSet,
  passportUserIdSet,
  stickerHuntUserIdSet,
  sectorName,
  onStandSelect,
}: FestivalNavMapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef<ReactZoomPanPinchRef>(null);
  const visibleStands = useMemo(
    () => stands.filter((s) => s.status !== "disabled"),
    [stands],
  );
  // Resolved from the same list MapSurface draws, so a group that renders as
  // one outline carries exactly one set of activity badges.
  const occupiedStands = useMemo(
    () =>
      dedupeJointGroupMembers(
        visibleStands.filter(isOccupied),
        resolveJointGroups(visibleStands),
      ),
    [visibleStands],
  );

  const handleStandSelect = useCallback(
    (stand: StandWithReservationsWithParticipants) => {
      if (!isOccupied(stand)) return;
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
    const timer = window.setTimeout(() => {
      containerRef.current?.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "center",
      });
      transformRef.current?.resetTransform(reduceMotion ? 0 : 300, "easeOut");
    }, 50);

    return () => window.clearTimeout(timer);
  }, [locateRequest, visibleStands]);

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded-lg border"
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
            getColors={(stand) =>
              getNavStandColors(
                stand,
                couponBookUserIdSet,
                passportUserIdSet,
                stickerHuntUserIdSet,
              )
            }
            onStandClick={handleStandSelect}
            onStandTouchTap={handleStandSelect}
          >
            <FestivalNavStandBadges
              stands={occupiedStands}
              couponBookUserIdSet={couponBookUserIdSet}
              passportUserIdSet={passportUserIdSet}
              stickerHuntUserIdSet={stickerHuntUserIdSet}
            />
          </MapSurface>
        </TransformComponent>

        <MapPinchHint className="bottom-12 pointer-events-none" />
      </MapTransformWrapper>
    </div>
  );
}
