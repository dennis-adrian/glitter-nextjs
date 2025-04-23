import ReservationsTable from "@/app/components/reservations/reservations-table";
import { fetchReservationsByFestivalId } from "@/app/lib/reservations/actions";
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

  return (
    <div className="container">
      <h1 className="text-2xl font-bold">Reservas del festival</h1>
      <ReservationsTable data={reservations} />
    </div>
  );
}
