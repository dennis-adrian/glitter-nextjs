"use client";

import ParticipantInfo, {
  type PublicFestivalParticipant,
} from "@/app/components/festivals/participant-info";

export default function PublicFestivalParticipants({
  participants,
}: {
  participants: PublicFestivalParticipant[];
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {participants.length}{" "}
        {participants.length === 1 ? "participante" : "participantes"}
      </p>

      {participants.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {participants.map((participant) => (
            <ParticipantInfo key={participant.id} profile={participant} />
          ))}
        </div>
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
