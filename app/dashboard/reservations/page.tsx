import { fetchUserProfile } from "@/app/api/users/actions";
import { currentUser } from "@clerk/nextjs/server";
import { BanIcon, CheckIcon, HourglassIcon } from "lucide-react";
import Link from "next/link";

import { fetchReservations } from "@/app/api/reservations/actions";
import TotalsCard from "@/app/components/dashboard/totals/card";
import { columnTitles, columns } from "@/app/components/reservations/columns";
import { Button } from "@/app/components/ui/button";
import { DataTable } from "@/app/components/ui/data_table/data-table";

const statusOptions = [
  { value: "pending", label: "Pendiente" },
  { value: "accepted", label: "Aceptada" },
  { value: "rejected", label: "Rechazada" },
];

export default async function Page() {
  // TODO: Improve how this route protecting works
  const user = await currentUser();
  const data = await fetchUserProfile(user!.id);
  const profile = data.user;

  if (profile && profile.role !== "admin") {
    return (
      <div className="container flex min-h-full items-center justify-center p-4 md:p-6">
        <h1 className="font-smibold text-muted-foreground text-lg md:text-2xl">
          No tienes permisos para ver esta página
        </h1>
      </div>
    );
  }

  const reservations = await fetchReservations();
  const pendingReservations = reservations.filter(
    (reservation) => reservation.status === "pending",
  );
  const confirmedReservations = reservations.filter(
    (reservation) => reservation.status === "accepted",
  );
  const rejectedReservations = reservations.filter(
    (reservation) => reservation.status === "rejected",
  );

  if (reservations.length === 0) {
    return (
      <div className="container mx-auto min-h-full p-4 md:p-6">
        <h1 className="mb-2 text-3xl font-bold">Reservas</h1>
        <p>No hay reservas</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto min-h-full p-4 md:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="mb-2 text-3xl font-bold">Reservas</h1>
        <Button>
          <Link href="/dashboard/reservations/new">Nueva Reserva</Link>
        </Button>
      </div>

      <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
        <TotalsCard
          amount={pendingReservations.length}
          title="pendientes"
          description="Reservas pendientes de revisión"
          Icon={HourglassIcon}
        />
        <TotalsCard
          amount={confirmedReservations.length}
          title="aceptadas"
          description="Reservas aceptadas"
          Icon={CheckIcon}
        />
        <TotalsCard
          amount={rejectedReservations.length}
          title="rechazadas"
          description="Reservas rechazadas"
          Icon={BanIcon}
        />
      </div>

      <DataTable
        columns={columns}
        columnTitles={columnTitles}
        data={reservations}
        filters={[
          {
            columnId: "status",
            options: statusOptions,
          },
        ]}
      />
    </div>
  );
}
