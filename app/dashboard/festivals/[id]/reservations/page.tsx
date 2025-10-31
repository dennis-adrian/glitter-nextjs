import ReservationsTable from "@/app/components/reservations/reservations-table";
import CreateReservationDialog from "@/app/components/reservations/create-reservation-dialog";
import { fetchReservationsByFestivalId } from "@/app/lib/reservations/actions";
import { fetchFestival } from "@/app/lib/festivals/actions";
import { z } from "zod";

const ParamsSchema = z.object({
  id: z.coerce.number(),
});

export default async function FestivalReservationsPage({
  params,
}: {
  params: Promise<z.infer<typeof ParamsSchema>>;
}) {
  const { id } = await params;
  const reservations = await fetchReservationsByFestivalId(id);
  const festival = await fetchFestival({ acceptedUsersOnly: true, id });
  const participants = (festival?.userRequests || []).map((r) => r.user);
  const seen: Record<number, boolean> = {};
  const uniqueParticipants = participants.filter((u) => {
    if (seen[u.id]) return false;
    seen[u.id] = true;
    return true;
  });
  const stands = (festival?.festivalSectors || []).flatMap((s) => s.stands);

  return (
    <div className="container">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Reservas del festival</h1>
        <CreateReservationDialog
          festivalId={id}
          participants={uniqueParticipants as any}
          stands={stands as any}
        />
      </div>
      <ReservationsTable data={reservations} />
    </div>
  );
}