import { BanIcon, CheckIcon, HourglassIcon } from "lucide-react";

import { fetchReservations } from "@/app/api/reservations/actions";

import TotalsCard from "@/app/components/dashboard/totals/card";
import { columnTitles, columns } from "@/app/components/reservations/columns";
import { DataTable } from "@/app/components/ui/data_table/data-table";

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
      <div className="container mx-auto py-10">
        <h1 className="mb-2 text-3xl font-bold">Reservas</h1>
        <p>No hay reservas</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10">
      <h1 className="mb-2 text-3xl font-bold">Reservas</h1>

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
        statusOptions={[
          { value: "", label: "Todas" },
          { value: "pending", label: "Pendientes" },
          { value: "accepted", label: "Aceptadas" },
          { value: "rejected", label: "Rechazadas" },
        ]}
      />
    </div>
  );
}
