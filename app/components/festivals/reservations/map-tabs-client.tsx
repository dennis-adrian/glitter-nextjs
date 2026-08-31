"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import ClientMap from "@/app/components/festivals/client-map";
import StepIndicator from "@/app/components/festivals/reservations/step-indicator";
import type { FestivalReservationMapDto } from "@/app/lib/reservations/dto";

type MapTabsClientProps = {
  map: FestivalReservationMapDto;
};

function MapDisclaimer() {
  return (
    <p className="text-center text-[10px] md:text-xs text-muted-foreground leading-3 md:leading-4 max-w-[400px]">
      El plano muestra las ubicaciones y la distribución confirmada de los
      stands. Las medidas y proporciones de todos los elementos son estimadas y
      se utilizan de manera orientativa.
    </p>
  );
}

export default function MapTabsClient({ map }: MapTabsClientProps) {
  const orderedSectors = map.sectors;
  const [activeTabId, setActiveTabId] = useState(() => {
    const firstWithAvailable = orderedSectors.find(
      (s) => s.availableCount > 0,
    );
    return (firstWithAvailable ?? orderedSectors[0])?.id ?? null;
  });
  const [standCounts, setStandCounts] = useState<Record<number, number>>(() =>
    Object.fromEntries(
      orderedSectors.map((s) => [s.id, s.availableCount]),
    ),
  );

  if (orderedSectors.length === 0) {
    return (
      <div className="flex flex-col min-h-[calc(100dvh-4rem)]">
        <StepIndicator
          step={1}
          totalSteps={3}
          backLabel="Mi perfil"
          backHref="/my_profile"
        />
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          No tenés sectores habilitados para este festival
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-[calc(100dvh-4rem)]">
      <StepIndicator
        step={1}
        totalSteps={3}
        backLabel="Mi perfil"
        backHref="/my_profile"
      />
      <div className="max-w-3xl mx-auto px-4 py-4 md:py-6 w-full">
        <div className="flex gap-2 flex-wrap mb-4">
          {orderedSectors.map((sector) => {
            const isActive = sector.id === activeTabId;
            return (
              <button
                key={sector.id}
                type="button"
                onClick={() => setActiveTabId(sector.id)}
                className={cn(
                  "flex flex-col items-start text-left px-4 py-3 rounded-xl border-2 min-w-[110px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isActive
                    ? "bg-primary border-primary text-primary-foreground"
                    : "bg-card border-border text-foreground hover:border-primary/50",
                )}
              >
                <span className="font-bold text-sm leading-tight">
                  {sector.name}
                </span>
                <span
                  className={cn(
                    "text-xs mt-0.5",
                    isActive ? "opacity-80" : "text-muted-foreground",
                  )}
                >
                  {standCounts[sector.id] ?? 0} disp.
                </span>
              </button>
            );
          })}
        </div>

        {orderedSectors.map((sector) =>
          sector.id === activeTabId ? (
            <div key={sector.id} className="flex flex-col items-center gap-2">
              <div className="w-full md:max-w-2xl mx-auto">
                <ClientMap
                  festival={map.festival}
                  profile={map.profile}
                  sectorId={sector.id}
                  sectorName={sector.name}
                  stands={sector.stands}
                  mapElements={sector.mapElements}
                  activeHold={map.activeHold}
                  alreadyReserved={map.alreadyReserved}
                  subcategoryIds={map.subcategoryIds}
                  mapBounds={sector.mapBounds ?? undefined}
                  onAvailableCountChange={(count) =>
                    setStandCounts((prev) => ({
                      ...prev,
                      [sector.id]: count,
                    }))
                  }
                />
              </div>
              <MapDisclaimer />
            </div>
          ) : null,
        )}
      </div>
    </div>
  );
}
