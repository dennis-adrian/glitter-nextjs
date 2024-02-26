import { BanIcon, CheckIcon, HourglassIcon } from "lucide-react";

import { fetchReservations } from "@/app/api/reservations/actions";

import TotalsCard from "@/app/components/dashboard/totals/card";
import { columnTitles, columns } from "@/app/components/reservations/columns";
import { DataTable } from "@/app/components/ui/data_table/data-table";
import { Button } from "@/app/components/ui/button";
import Link from "next/link";

const statusOptions = [
  { value: "pending", label: "Pendiente" },
  { value: "accepted", label: "Aceptada" },
  { value: "rejected", label: "Rechazada" },
];

export default async function Page() {
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
      <div className="container mx-auto px-4 md:px-6 h-full">
        <h1 className="mb-2 text-3xl font-bold">Reservas</h1>
        <p>No hay reservas</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 md:px-6 h-full">
      <div className="flex justify-between items-center mb-4">
        <h1 className="mb-2 text-3xl font-bold">Reservas</h1>
        <Button>
          <Link href="/dashboard/reservations/new">Nueva Reserva</Link>
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
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
