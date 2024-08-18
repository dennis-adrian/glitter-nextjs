import { getCurrentUserProfile } from "@/app/lib/users/helpers";

import UsersTable from "@/app/components/users/table";
import {
  fetchUserProfiles,
  fetchUsersAggregates,
} from "@/app/lib/users/actions";
import {
  SearchParamsSchema,
  SearchParamsSchemaType,
} from "@/app/dashboard/users/schemas";
import { notFound } from "next/navigation";

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParamsSchemaType;
}) {
  const validatedSearchParams = SearchParamsSchema.safeParse(searchParams);
  if (!validatedSearchParams.success) notFound();

  const { limit, offset, includeAdmins, status } = validatedSearchParams.data;
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

  const users = await fetchUserProfiles({
    limit,
    offset,
    includeAdmins,
    status,
  });
  const aggregates = await fetchUsersAggregates({
    includeAdmins,
    status,
  });

  return (
    <div className="container mx-auto min-h-full p-4 md:p-6">
      <h1 className="mb-2 text-2xl font-bold md:text-3xl">Usuarios</h1>
      <UsersTable
        aggregates={aggregates}
        users={users}
        limit={limit || 10}
        offset={offset || 0}
      />
    </div>
  );
}
