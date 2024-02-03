import { fetchRequests } from "@/app/api/user_requests/actions";
import TotalsCard from "@/components/user_requests/totals/card";
import { DataTable } from "@/components/ui/data_table/data-table";
import { columns, columnTitles } from "@/components/user_requests/columns";
import { BanIcon, CheckIcon, HourglassIcon } from "lucide-react";

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
          Icon={HourglassIcon}
        />
        <TotalsCard
          amount={approvedRequests.length}
          title="aceptadas"
          Icon={CheckIcon}
        />
        <TotalsCard
          amount={rejectedRequests.length}
          title="rechazadas"
          Icon={BanIcon}
        />
      </div>

      <DataTable
        columns={columns}
        columnTitles={columnTitles}
        data={requests}
        searchField="user"
        searchPlaceholder="Buscar por usuario"
      />
    </div>
  );
}
