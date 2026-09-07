import { ParticipantCard } from "@/app/components/next_event/participants/card";
import { compareParticipantDisplayNames } from "@/app/components/next_event/participants/compare-display-names";
import { fetchPublicFestivalParticipantSummaries } from "@/app/lib/reservations/queries";

export async function Participants({ festivalId }: { festivalId: number }) {
  const participants = await fetchPublicFestivalParticipantSummaries(festivalId);

  return (
    <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4 lg:gap-6 xl:grid-cols-4">
      {participants
        .sort(compareParticipantDisplayNames)
        .map((user) => (
          <ParticipantCard key={user.id} profile={user} />
        ))}
    </div>
  );
}
