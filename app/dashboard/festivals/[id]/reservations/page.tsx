import ReservationsTable from "@/app/components/reservations/reservations-table";
import { fetchReservationsByFestivalId } from "@/app/lib/reservations/actions";
import { Button } from "@/app/components/ui/button";
import Link from "next/link";
import { Plus } from "lucide-react";
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
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Reservas del festival</h1>
        <Button asChild size="sm">
          <Link href={`/dashboard/festivals/${id}/reservations/new`}>
            <Plus className="mr-2 h-4 w-4" />
            Agregar reserva
          </Link>
        </Button>
      </div>
      <ReservationsTable data={reservations} />
    </div>
  );
}
