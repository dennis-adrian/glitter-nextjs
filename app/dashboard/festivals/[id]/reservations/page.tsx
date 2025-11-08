import ReservationsTable from "@/app/components/reservations/reservations-table";
import CreateReservationDialog from "@/app/components/reservations/create-reservation-dialog";
import { fetchReservationsByFestivalId } from "@/app/lib/reservations/actions";
import { fetchFestival } from "@/app/lib/festivals/actions";
import { z } from "zod";
import type { BaseProfile } from "@/app/api/users/definitions";

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
  const seen = new Set<number>();
  const uniqueParticipants =
    festival?.userRequests?.reduce<BaseProfile[]>((acc, request) => {
      const user = request.user;
      if (!user || seen.has(user.id)) {
        return acc;
      }
      seen.add(user.id);
      acc.push(user);
      return acc;
    }, []) ?? [];
  const stands =
    festival?.festivalSectors?.flatMap((sector) => sector.stands ?? []) ?? [];

  return (
    <div className="container">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Reservas del festival</h1>
        <CreateReservationDialog
          festivalId={id}
          participants={uniqueParticipants}
          stands={stands}
        />
      </div>
      <ReservationsTable data={reservations} />
    </div>
  );
}