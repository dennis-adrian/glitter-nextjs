import { fetchRequests } from "@/app/api/user_requests/actions";
import TotalsCard from "@/app/components/dashboard/totals/card";
import { DataTable } from "@/components/ui/data_table/data-table";
import { columns, columnTitles } from "@/components/user_requests/columns";
import { BanIcon, CheckIcon, HourglassIcon } from "lucide-react";

const statusOptions = [
  { value: "pending", label: "Pendientes" },
  { value: "accepted", label: "Aceptadas" },
  { value: "rejected", label: "Rechazadas" },
];

const typeOptions = [
  { value: "become_artist", label: "Ser Artista" },
  { value: "festival_participation", label: "Participación en Festival" },
];

export default async function Page() {
  const requests = await fetchRequests();
  const pendingRequests = requests.filter(
    (request) => request.status === "pending",
  );
  const approvedRequests = requests.filter(
    (request) => request.status === "accepted",
  );
  const rejectedRequests = requests.filter(
    (request) => request.status === "rejected",
  );

  return (
    <div className="container mx-auto min-h-full p-4 md:p-6">
      <h1 className="mb-2 text-2xl font-bold md:text-3xl">Solicitudes</h1>

      <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
        <TotalsCard
          amount={pendingRequests.length}
          title="pendientes"
          description="Solicitudes pendientes de revisión"
          Icon={HourglassIcon}
        />
        <TotalsCard
          amount={approvedRequests.length}
          title="aceptadas"
          description="Solicitudes aceptadas"
          Icon={CheckIcon}
        />
        <TotalsCard
          amount={rejectedRequests.length}
          title="rechazadas"
          description="Solicitudes rechazadas"
          Icon={BanIcon}
        />
      </div>

      <DataTable
        columns={columns}
        columnTitles={columnTitles}
        data={requests}
        filters={[
          {
            columnId: "status",
            options: statusOptions,
          },
          {
            columnId: "type",
            options: typeOptions,
          },
        ]}
      />
    </div>
  );
}
