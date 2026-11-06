"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { Loader2Icon } from "lucide-react";

import type {
  ReservationMapFestivalDto,
  ReservationMapProfileDto,
  ReservationMapStandDto,
} from "@/app/lib/reservations/dto";
import type { ReservationMapElementDto } from "@/app/lib/reservations/dto";
import UserMap from "@/app/components/maps/user/user-map";
import {
  StandInfoCard,
  type ActiveHold,
} from "@/app/components/festivals/reservations/stand-info-card";
import { useStandPolling } from "@/app/hooks/use-stand-polling";
import { findJointGroup } from "@/app/lib/stands/groups";
import { mergePolledStandStatuses } from "@/app/lib/stands/status-poll";

export default function ClientMap({
  festival,
  profile,
  sectorId,
  sectorName,
  stands: initialStands,
  mapElements,
  mapBounds,
  activeHold: initialActiveHold,
  alreadyReserved,
  subcategoryIds = [],
  fullTableAccessActive = false,
  fullTableActivationPrice = null,
  onAvailableCountChange,
}: {
  festival: ReservationMapFestivalDto;
  profile: ReservationMapProfileDto;
  sectorId?: number;
  sectorName?: string;
  stands: ReservationMapStandDto[];
  mapElements?: ReservationMapElementDto[];
  mapBounds?: { minX: number; minY: number; width: number; height: number };
  activeHold?: ActiveHold;
  alreadyReserved: boolean;
  subcategoryIds?: number[];
  fullTableAccessActive?: boolean;
  fullTableActivationPrice?: number | null;
  onAvailableCountChange?: (count: number) => void;
}) {
  const [stands, setStands] = useState(initialStands);
  const onAvailableCountChangeRef = useRef(onAvailableCountChange);

  useEffect(() => {
    onAvailableCountChangeRef.current = onAvailableCountChange;
  }, [onAvailableCountChange]);

  useEffect(() => {
    onAvailableCountChangeRef.current?.(
      stands.filter((stand) => stand.effectiveStatus === "available").length,
    );
  }, [stands]);

  const [selectedStandId, setSelectedStandId] = useState<number | null>(null);
  const selectedStand =
    selectedStandId != null
      ? (stands.find((s) => s.id === selectedStandId) ?? null)
      : null;
  const selectedGroupStands = useMemo(
    () => findJointGroup(stands, selectedStandId)?.stands,
    [stands, selectedStandId],
  );
  const [activeHold, setActiveHold] = useState<ActiveHold>(
    initialActiveHold ?? null,
  );
  const [isPending, startTransition] = useTransition();

  const handleHoldChange = useCallback((hold: ActiveHold) => {
    setActiveHold(hold);
  }, []);

  // The hold comes from the map DTO (rebuilt on every arrival) and from
  // selections made here; each poll drops it once it has expired.
  const { stale, pollNow } = useStandPolling(
    sectorId ?? null,
    4000,
    (result) => {
      setStands((prev) => mergePolledStandStatuses(prev, result.stands));
      setActiveHold((hold) =>
        hold?.expiresAt != null && Date.parse(hold.expiresAt) <= Date.now()
          ? null
          : hold,
      );
    },
  );

  // A lost race: paint the stands the server said are gone as taken in this
  // frame (the next poll overwrites the mark with their real status) and ask
  // for that poll now rather than in up to 4 s.
  const handleStandUnavailable = useCallback(
    (standIds: number[]) => {
      setStands((prev) =>
        mergePolledStandStatuses(
          prev,
          standIds.map((standId) => ({
            standId,
            effectiveStatus: "held" as const,
            updatedAt: null,
          })),
        ),
      );
      pollNow();
    },
    [pollNow],
  );

  const handleStandSelect = useCallback(
    (stand: ReservationMapStandDto) => {
      if (isPending) return;
      setSelectedStandId(stand.id);
    },
    [isPending],
  );

  // Tapping the map's background closes the card. No backdrop (the map must
  // stay pannable with the card open) and no document listener (it would
  // fire inside the card's portaled dialogs): a tap is a press and release on
  // this wrapper that moved under 10 px — the stands' own threshold — and
  // landed on neither a stand nor a button.
  const backgroundPress = useRef<{ x: number; y: number } | null>(null);
  const handleBackgroundPointerDown = (event: React.PointerEvent) => {
    backgroundPress.current = { x: event.clientX, y: event.clientY };
  };
  const handleBackgroundPointerUp = (event: React.PointerEvent) => {
    const start = backgroundPress.current;
    backgroundPress.current = null;
    if (!start || selectedStandId == null) return;
    if (
      Math.abs(event.clientX - start.x) >= 10 ||
      Math.abs(event.clientY - start.y) >= 10
    ) {
      return;
    }
    if ((event.target as Element).closest("[data-map-stand-id], button")) {
      return;
    }
    setSelectedStandId(null);
  };

  return (
    <>
      <div
        className="relative"
        onPointerDown={handleBackgroundPointerDown}
        onPointerUp={handleBackgroundPointerUp}
        onPointerCancel={() => {
          backgroundPress.current = null;
        }}
      >
        <UserMap
          stands={stands}
          mapElements={mapElements}
          mapBounds={mapBounds}
          profile={profile}
          selectedStandId={selectedStandId}
          subcategoryIds={subcategoryIds}
          onStandClick={handleStandSelect}
          onStandTouchTap={handleStandSelect}
        />
        {stale && (
          <p
            className="pointer-events-none absolute inset-x-0 top-2 z-10 mx-auto w-fit rounded-md bg-background/90 px-3 py-1 text-center text-xs text-muted-foreground shadow-sm"
            role="status"
          >
            La disponibilidad puede estar desactualizada. Reintentamos
            automáticamente.
          </p>
        )}
        {isPending && (
          <div
            className="absolute inset-0 z-10 flex cursor-wait items-center justify-center bg-background/50 backdrop-blur-[1px]"
            aria-busy="true"
          >
            <Loader2Icon className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}
      </div>
      {selectedStand != null && profile != null && sectorName != null && (
        <StandInfoCard
          key={selectedStand.id}
          stand={selectedStand}
          sectorName={sectorName}
          groupStands={selectedGroupStands}
          profile={profile}
          festival={festival}
          alreadyReserved={alreadyReserved}
          subcategoryIds={subcategoryIds}
          activeHold={activeHold}
          // The live, polled list — so the companion's availability reflects
          // what the participant is looking at right now.
          sectorStands={stands}
          fullTableAccessActive={fullTableAccessActive}
          fullTableActivationPrice={fullTableActivationPrice}
          onHoldChange={handleHoldChange}
          onStandUnavailable={handleStandUnavailable}
          onClose={() => setSelectedStandId(null)}
          isPending={isPending}
          startTransition={startTransition}
        />
      )}
    </>
  );
}
