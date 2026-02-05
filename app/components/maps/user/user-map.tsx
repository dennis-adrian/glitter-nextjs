"use client";

import { useCallback, useEffect, useState } from "react";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import { ZoomIn } from "lucide-react";

import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import { BaseProfile, ProfileType } from "@/app/api/users/definitions";
import { canStandBeReserved } from "@/app/lib/stands/helpers";

import MapCanvas from "@/app/components/maps/map-canvas";
import MapStand from "@/app/components/maps/map-stand";
import MapToolbar from "@/app/components/maps/map-toolbar";
import MapLegend from "@/app/components/maps/map-legend";
import MapTooltip from "@/app/components/maps/map-tooltip";
import MapStandDrawer from "@/app/components/maps/map-stand-drawer";
import { StandClickHandler } from "@/app/components/maps/map-types";
import { computeCanvasBounds } from "@/app/components/maps/map-utils";

type UserMapProps = {
  stands: StandWithReservationsWithParticipants[];
  profile?: ProfileType | BaseProfile | null;
  forReservation?: boolean;
  onStandClick?: StandClickHandler;
};

export default function UserMap({
  stands,
  profile,
  forReservation,
  onStandClick,
}: UserMapProps) {
  const [participantProfiles, setParticipantProfiles] = useState<ProfileType[]>(
    [],
  );

  const [hoveredStand, setHoveredStand] = useState<StandWithReservationsWithParticipants | null>(null);
  const [hoveredRect, setHoveredRect] = useState<DOMRect | null>(null);
  const [tappedStand, setTappedStand] = useState<StandWithReservationsWithParticipants | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleTap = useCallback(
    (stand: StandWithReservationsWithParticipants) => {
      setTappedStand(stand);
      setDrawerOpen(true);
    },
    [],
  );

  const handleHoverChange = useCallback(
    (stand: StandWithReservationsWithParticipants | null, rect: DOMRect | null) => {
      setHoveredStand(stand);
      setHoveredRect(rect);
    },
    [],
  );

  useEffect(() => {
    const reservations = stands.flatMap((stand) => stand.reservations);
    const participantIds = reservations.flatMap((reservation) =>
      reservation.participants.map((participant) => participant.user.id),
    );

    if (participantIds.length === 0) return;

    fetch("/api/users_by_id", {
      method: "POST",
      body: JSON.stringify({ ids: participantIds }),
    })
      .then(async (res) => {
        if (!res.ok) {
          console.error("Failed to fetch participant profiles:", res.status);
          setParticipantProfiles([]);
          return;
        }
        const profiles = (await res.json()) as ProfileType[];
        setParticipantProfiles(profiles);
      })
      .catch((error) => {
        console.error("Error fetching participant profiles:", error);
        setParticipantProfiles([]);
      });
  }, [stands]);

  function getParticipantProfilesForStand(
    stand: StandWithReservationsWithParticipants,
  ): ProfileType[] {
    const participantIds = stand.reservations
      ?.filter((reservation) => reservation.status !== "rejected")
      .flatMap((reservation) =>
        reservation.participants.map((participant) => participant.user.id),
      );

    return participantProfiles.filter((p) => participantIds.includes(p.id));
  }

  const canvasBounds = computeCanvasBounds(stands);

  return (
    <div className="flex flex-col items-center w-full">
      <MapLegend />
      <TransformWrapper
        initialScale={1}
        minScale={0.5}
        maxScale={4}
        centerOnInit
        wheel={{ step: 0.1 }}
      >
        <div className="w-full md:max-w-2xl rounded-lg border bg-background shadow-sm overflow-hidden">
          <TransformComponent
            wrapperStyle={{ width: "100%" }}
            contentStyle={{ width: "100%" }}
          >
            <MapCanvas config={{ minX: canvasBounds.minX, minY: canvasBounds.minY, width: canvasBounds.width, height: canvasBounds.height }}>
              {stands.map((stand) => {
                const standCanBeReserved =
                  !!forReservation &&
                  !!profile &&
                  canStandBeReserved(stand, profile);

                return (
                  <MapStand
                    key={stand.id}
                    stand={stand}
                    canBeReserved={standCanBeReserved}
                    onClick={onStandClick}
                    onHoverChange={handleHoverChange}
                    onTouchTap={handleTap}
                  />
                );
              })}
            </MapCanvas>
          </TransformComponent>
        </div>
        {hoveredStand && hoveredRect && (
          <MapTooltip
            stand={hoveredStand}
            canBeReserved={
              !!forReservation &&
              !!profile &&
              canStandBeReserved(hoveredStand, profile)
            }
            participantProfiles={getParticipantProfilesForStand(hoveredStand)}
            anchorRect={hoveredRect}
          />
        )}
        <MapStandDrawer
          stand={tappedStand}
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          canBeReserved={
            !!tappedStand &&
            !!forReservation &&
            !!profile &&
            canStandBeReserved(tappedStand, profile)
          }
          participantProfiles={
            tappedStand
              ? getParticipantProfilesForStand(tappedStand)
              : []
          }
        />
        <div className="flex items-center gap-3 mt-2">
          <MapToolbar />
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <ZoomIn className="h-3 w-3" />
            <span className="md:hidden">Pellizca para acercar</span>
            <span className="hidden md:inline">Usa scroll o los botones para acercar</span>
          </p>
        </div>
      </TransformWrapper>
    </div>
  );
}
