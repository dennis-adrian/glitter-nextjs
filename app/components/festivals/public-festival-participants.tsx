"use client";

import { useEffect, useState } from "react";

import ParticipantInfo, {
  type PublicFestivalParticipant,
} from "@/app/components/festivals/participant-info";
import { Button } from "@/app/components/ui/button";

const PAGE_SIZE = 10;

export default function PublicFestivalParticipants({
  participants,
}: {
  participants: PublicFestivalParticipant[];
}) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // A new list means new results: start them from the top rather than leaving
  // the reader deep inside a page count they built up under other filters.
  useEffect(() => setVisibleCount(PAGE_SIZE), [participants]);

  const visibleParticipants = participants.slice(0, visibleCount);
  const remaining = participants.length - visibleParticipants.length;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {remaining > 0
          ? `Mostrando ${visibleParticipants.length} de ${participants.length} participantes`
          : `${participants.length} ${
              participants.length === 1 ? "participante" : "participantes"
            }`}
      </p>

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
          <p className="font-semibold">No encontramos coincidencias.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Probá otro nombre, número de stand o categoría.
          </p>
        </div>
      )}
    </div>
  );
}
