import { fetchRequests } from "@/app/api/user_requests/actions";
import { columns, columnTitles } from "@/components/user_requests/columns";
import { DataTable } from "@/components/ui/data_table/data-table";

export default async function Page() {
  const requests = await fetchRequests();

  return (
    <div className="container mx-auto py-10">
      <h1 className="mb-2 text-3xl font-bold">Solicitudes</h1>
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
