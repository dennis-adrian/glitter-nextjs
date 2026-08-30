import { fetchPublicFestivalParticipantSummaries } from "@/app/lib/reservations/queries";
import { ParticipantCard } from "@/app/components/next_event/participants/card";

export async function Participants({ festivalId }: { festivalId: number }) {
  const participants = await fetchPublicFestivalParticipantSummaries(festivalId);

  return (
    <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4 lg:gap-6 xl:grid-cols-4">
      {participants
        .sort(
          (a, b) =>
            a.displayName?.localeCompare(b.displayName || "") || 0,
        )
        .map((user) => (
          <ParticipantCard key={user.id} profile={user} />
        ))}
    </div>
  );
}
