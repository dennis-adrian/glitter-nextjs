import { fetchProfiles } from "@/app/api/users/actions";
import { columnTitles, columns } from "@/components/users/columns";
import { DataTable } from "@/components/ui/data_table/data-table";
import TotalsCard from "@/app/components/users/totals/card";
import { UsersIcon } from "lucide-react";

export default async function DemoPage() {
  const users = await fetchProfiles();
  const artists = users.filter((user) => user.role === "artist");
  const regularUsers = users.filter((user) => user.role === "user");

  return (
    <div className="container mx-auto py-10">
      <h1 className="text-3xl font-bold mb-2">Usuarios</h1>
      <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
        <TotalsCard
          amount={users.length}
          title="usuarios totales"
          description="Usuarios en la base de datos"
          Icon={UsersIcon}
        />
        <TotalsCard
          amount={artists.length}
          description="Usuarios que son artistas"
          title="artistas"
          Icon={UsersIcon}
        />
        <TotalsCard
          amount={regularUsers.length}
          title="usuarios regulares"
          description="Usuarios regulares"
          Icon={UsersIcon}
        />
      </div>
      <DataTable
        columns={columns}
        columnTitles={columnTitles}
        data={users}
        searchField="displayName"
        searchPlaceholder="Buscar por nombre..."
      />
    </div>
  );
}
