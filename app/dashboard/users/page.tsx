import { UsersIcon } from "lucide-react";
import { currentUser } from "@clerk/nextjs/server";

import { fetchProfiles, fetchUserProfile } from "@/app/api/users/actions";
import { columnTitles, columns } from "@/components/users/columns";
import { DataTable } from "@/components/ui/data_table/data-table";
import TotalsCard from "@/app/components/dashboard/totals/card";

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

  const users = await fetchProfiles();
  const artists = users.filter((user) => user.role === "artist");
  const regularUsers = users.filter((user) => user.role === "user");

  return (
    <div className="container mx-auto min-h-full p-4 md:p-6">
      <h1 className="mb-2 text-2xl font-bold md:text-3xl">Usuarios</h1>
      <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
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
        filters={[
          {
            columnId: "role",
            options: [
              { value: "admin", label: "Admins" },
              { value: "artist", label: "Artistas" },
              { value: "user", label: "Usuarios" },
            ],
          },
        ]}
      />
    </div>
  );
}
