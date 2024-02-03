import { fetchProfiles } from "@/app/api/users/actions";
import { columnTitles, columns } from "@/components/users/columns";
import { DataTable } from "@/components/ui/data_table/data-table";

export default async function DemoPage() {
  const users = await fetchProfiles();

  return (
    <div className="container mx-auto py-10">
      <h1 className="text-3xl font-bold mb-2">Usuarios</h1>
      <DataTable
        columns={columns}
        columnTitles={columnTitles}
        data={users}
        searchField="displayName"
        searchPlaceholder="Buscar por nombre de artista"
      />
    </div>
  );
}
