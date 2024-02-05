import { fetchConfirmedReservationsByFestival } from "@/app/api/reservations/actions";
import { ParticipantCard } from "@/app/components/next_event/participants/card";

export async function Participants({ festivalId }: { festivalId: number }) {
  const reservations = await fetchConfirmedReservationsByFestival(festivalId);

  const participants = reservations.flatMap(
    (reservation) => reservation.participants,
  );

  return (
    <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4 lg:gap-6 xl:grid-cols-4">
      {participants.map(({ user }) => (
        <ParticipantCard key={user.id} profile={user} />
      ))}
    </div>
  );
}
