import { fetchRequests } from "@/app/api/user_requests/actions";
import TotalsCard from "@/app/components/dashboard/totals/card";
import { DataTableStatusFilter } from "@/app/components/dashboard/data_table/filters/status";
import { DataTable } from "@/components/ui/data_table/data-table";
import { columns, columnTitles } from "@/components/user_requests/columns";
import { BanIcon, CheckIcon, HourglassIcon } from "lucide-react";
import { DataTableTypeFilter } from "@/app/components/dashboard/data_table/filters/type";

const statusOptions = [
  { value: "", label: "Todas" },
  { value: "pending", label: "Pendientes" },
  { value: "accepted", label: "Aceptadas" },
  { value: "rejected", label: "Rechazadas" },
];

const typeOptions = [
  { value: "", label: "Todas" },
  { value: "become_artist", label: "Ser Artista" },
  { value: "festival_Participation", label: "Participación en Festival" },
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
    <div className="container mx-auto py-10">
      <h1 className="mb-2 text-3xl font-bold">Solicitudes</h1>

      <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
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
            component: DataTableStatusFilter,
            props: { statusOptions },
          },
          {
            component: DataTableTypeFilter,
            props: { options: typeOptions },
          },
        ]}
      />
    </div>
  );
}
