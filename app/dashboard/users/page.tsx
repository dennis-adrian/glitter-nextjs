import { getCurrentUserProfile } from "@/app/lib/users/helpers";

import UsersTable from "@/app/components/users/table";
import {
  SearchParamsSchema,
  SearchParamsSchemaType,
} from "@/app/dashboard/users/schemas";
import { notFound } from "next/navigation";

export default async function Page(
  props: {
    searchParams: Promise<SearchParamsSchemaType>;
  }
) {
  const searchParams = await props.searchParams;
  const validatedSearchParams = SearchParamsSchema.safeParse(searchParams);
  if (!validatedSearchParams.success) notFound();

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

  return (
    <div
      className="container mx-auto min-h-full p-4 md:p-6"
      key={Math.random()} // This is to force the component to re-render and show the skeleton
    >
      <h1 className="mb-2 text-2xl font-bold md:text-3xl">Usuarios</h1>
      <UsersTable {...validatedSearchParams.data} />
    </div>
  );
}
