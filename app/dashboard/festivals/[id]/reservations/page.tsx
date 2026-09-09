import LensTabs from "@/app/components/reservations/lens-tabs";
import ReservationsTable from "@/app/components/reservations/reservations-table";
import { fetchReservationsByFestivalId } from "@/app/lib/reservations/actions";
import { Button } from "@/app/components/ui/button";
import Link from "next/link";
import { Plus } from "lucide-react";
import {
  LENS_DESCRIPTIONS,
  parseLens,
} from "@/app/lib/reservations/console-lenses";
import { canMutateAdminReservations } from "@/app/lib/reservations/policy";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { z } from "zod";

const ParamsSchema = z.object({
  id: z.coerce.number(),
});

/**
 * The festival's reservations and their cobros, in one table.
 *
 * `/payments` used to be a second route over the same join — one invoice per
 * reservation, rooted the other way — and the two drifted into showing
 * different answers about the same row. It now redirects to the cobros lens.
 */
export default async function FestivalReservationsPage({
  params,
  searchParams,
}: {
  params: Promise<z.infer<typeof ParamsSchema>>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const { lens: lensParam } = await searchParams;
  const lens = parseLens(lensParam);

  const [reservations, profile] = await Promise.all([
    fetchReservationsByFestivalId(id),
    getCurrentUserProfile(),
  ]);
  // Festival admins can read this page but mutate nothing on it; the actions
  // menu disables what they cannot do rather than offering it and failing.
  const canMutate = canMutateAdminReservations(profile);

  return (
    <div className="container p-4 md:p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reservas y cobros</h1>
          <p className="text-sm text-muted-foreground">
            {LENS_DESCRIPTIONS[lens]}
          </p>
        </div>
        <Button asChild size="sm">
          <Link href={`/dashboard/festivals/${id}/reservations/new`}>
            <Plus className="mr-2 h-4 w-4" />
            Agregar reserva
          </Link>
        </Button>
      </div>

      <LensTabs festivalId={id} active={lens} />

      <div className="mt-4">
        <ReservationsTable
          data={reservations}
          canMutate={canMutate}
          lens={lens}
        />
      </div>
    </div>
  );
}
