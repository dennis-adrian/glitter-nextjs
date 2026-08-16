"use client";

import { useEffect, useMemo, useState } from "react";

import {
  sortFestivalParticipants,
  type ParticipantSort,
} from "@/app/components/festivals/festival-visitor-filters";
import ParticipantInfo, {
  type PublicFestivalParticipant,
} from "@/app/components/festivals/participant-info";
import ParticipantSortToggle from "@/app/components/festivals/participant-sort-toggle";
import { Button } from "@/app/components/ui/button";

const PAGE_SIZE = 10;

export default function PublicFestivalParticipants({
  participants,
  hasActiveFilters,
}: {
  participants: PublicFestivalParticipant[];
  hasActiveFilters: boolean;
}) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  // Stand order by default: it matches the route someone walks the festival in.
  const [sort, setSort] = useState<ParticipantSort>("stand");

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [participants]);

  const sortedParticipants = useMemo(
    () => sortFestivalParticipants(participants, sort),
    [participants, sort],
  );
  const visibleParticipants = sortedParticipants.slice(0, visibleCount);
  const remaining = sortedParticipants.length - visibleParticipants.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {remaining > 0
            ? `Mostrando ${visibleParticipants.length} de ${participants.length} participantes`
            : `${participants.length} ${
                participants.length === 1 ? "participante" : "participantes"
              }`}
        </p>

        {participants.length > 1 ? (
          <ParticipantSortToggle value={sort} onChange={setSort} />
        ) : null}
      </div>

      {participants.length > 0 ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {visibleParticipants.map((participant) => (
              <ParticipantInfo key={participant.id} profile={participant} />
            ))}
          </div>

          {remaining > 0 ? (
            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
              >
                Ver {Math.min(remaining, PAGE_SIZE)} más
              </Button>
            </div>
          ) : null}
        </>
      ) : (
        <div className="rounded-2xl border border-dashed px-6 py-12 text-center">
          {hasActiveFilters ? (
            <>
              <p className="font-semibold">No encontramos coincidencias.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Probá otro nombre, número de stand o categoría.
              </p>
            </>
          ) : (
            <>
              <p className="font-semibold">
                Aún no hay participantes publicados.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                La lista aparecerá cuando se confirmen los stands.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
