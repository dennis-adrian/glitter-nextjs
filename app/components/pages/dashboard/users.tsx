import { UsersIcon } from "lucide-react";

import { fetchProfiles } from "@/app/api/users/actions";
import TotalsCard from "@/app/components/dashboard/totals/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import UsersTable from "@/app/components/users/table";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

export default async function DashboardUsersPage() {
  const profile = await getCurrentUserProfile();

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

  return (
    <div className="container mx-auto min-h-full p-4 md:p-6">
      <h1 className="mb-2 text-2xl font-bold md:text-3xl">Usuarios</h1>
      <div className="hidden md:block">
        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
          <TotalsCard
            amount={users.length}
            title="usuarios totales"
            description="Usuarios en la base de datos"
            Icon={UsersIcon}
          />
        </div>
      </div>
      <Tabs defaultValue="all" className="my-4">
        <TabsList>
          <TabsTrigger value="all">Todos</TabsTrigger>
          <TabsTrigger value="complete">Completos</TabsTrigger>
          <TabsTrigger value="incomplete">Incompletos</TabsTrigger>
        </TabsList>
        <TabsContent value="all">
          <UsersTable users={users} />
        </TabsContent>
        <TabsContent value="complete">
          <UsersTable users={users} status="complete" />
        </TabsContent>
        <TabsContent value="incomplete">
          <UsersTable users={users} status="missingFields" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
