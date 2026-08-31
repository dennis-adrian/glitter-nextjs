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
  ReservationActiveHoldDto,
  ReservationMapFestivalDto,
  ReservationMapProfileDto,
  ReservationMapStandDto,
} from "@/app/lib/reservations/dto";
import type { ReservationMapElementDto } from "@/app/lib/reservations/dto";
import UserMap from "@/app/components/maps/user/user-map";
import { StandInfoCard } from "@/app/components/festivals/reservations/stand-info-card";
import { useStandPolling } from "@/app/hooks/use-stand-polling";
import { getActiveHold } from "@/app/lib/stands/hold-actions";
import { findJointGroup } from "@/app/lib/stands/groups";

type ActiveHold = ReservationActiveHoldDto | { id: number; standId: number } | null;

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

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    getActiveHold(festival.id)
      .then((hold) => {
        if (!cancelled) setActiveHold(hold);
      })
      .catch((error) => {
        console.error("Error fetching active hold", error);
      });

    return () => {
      cancelled = true;
    };
  }, [profile, festival.id]);

  useStandPolling(sectorId ?? null, 4000, (polledStands) => {
    setStands((prev) => {
      let changed = false;
      const updated = prev.map((s) => {
        const polled = polledStands.find((p) => p.id === s.id);
        if (polled && polled.status !== s.effectiveStatus) {
          changed = true;
          return {
            ...s,
            status: polled.status as ReservationMapStandDto["status"],
            effectiveStatus: polled.status as ReservationMapStandDto["status"],
          };
        }
        return s;
      });
      return changed ? updated : prev;
    });
  });

  const handleStandSelect = useCallback(
    (stand: ReservationMapStandDto) => {
      if (isPending) return;
      setSelectedStandId(stand.id);
    },
    [isPending],
  );

  return (
    <>
      <div className="relative">
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
          onHoldChange={handleHoldChange}
          onClose={() => setSelectedStandId(null)}
          isPending={isPending}
          startTransition={startTransition}
        />
      )}
    </>
  );
}
