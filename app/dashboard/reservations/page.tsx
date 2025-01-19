import ReservationsTable from "@/app/components/reservations/table";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { Suspense } from "react";
import TableSkeleton from "@/app/components/users/skeletons/table";
import { fetchFestivals } from "@/app/data/festivals/actions";
import { getFestivalsOptions } from "@/app/data/festivals/helpers";
import ReservationsTableFilters from "@/app/components/reservations/filters/table-filter";
import {
  ReservationsSearchParamsSchema,
  ReservationsSearchParamsSchemaType,
} from "./schemas";
import { notFound } from "next/navigation";

const statusOptions = [
  { value: "pending", label: "Pendiente" },
  { value: "accepted", label: "Aceptada" },
  { value: "rejected", label: "Rechazada" },
];

export default async function Page(
  props: {
    searchParams: Promise<ReservationsSearchParamsSchemaType>;
  }
) {
  const searchParams = await props.searchParams;
  const validatedSearchParams =
    ReservationsSearchParamsSchema.safeParse(searchParams);
  if (!validatedSearchParams.success) notFound();

  // TODO: Improve how this route protecting works
  const profile = await getCurrentUserProfile();

  if (profile && profile.role !== "admin") {
    return (
      <div className="container flex min-h-full items-center justify-center p-4 md:p-6">
        <h1 className="font-smibold text-muted-foreground text-lg md:text-2xl">
          No tienes permisos para ver esta página
        </h1>
      </div>
    );
  }

  const festivals = await fetchFestivals();

  return (
    <div
      className="container mx-auto min-h-full p-4 md:p-6"
      // key={Math.random()} // This is to force the component to re-render and show the skeleton
    >
      <h1 className="mb-2 text-2xl font-bold md:text-3xl">Reservas</h1>
      <ReservationsTableFilters festivals={festivals} />
      <Suspense fallback={<TableSkeleton />}>
        <ReservationsTable {...validatedSearchParams.data} />
      </Suspense>
    </div>
  );
}
