import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import VolunteerAdminListView from "@/app/components/volunteers/admin/volunteer-admin-list-view";
import type { RawSearchParams } from "@/app/lib/credits/admin-definitions";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";
import {
  POSTGRES_INT_MAX,
  VolunteerApplicationsSearchSchema,
} from "@/app/lib/volunteers/admin-definitions";
import {
  fetchVolunteerAdminCall,
  fetchVolunteerApplicationsPage,
} from "@/app/lib/volunteers/admin-queries";

const ParamsSchema = z.object({
  id: z.coerce.number().int().positive().max(POSTGRES_INT_MAX),
});

export const metadata: Metadata = { title: "Voluntarios" };

/**
 * The festival's volunteer applications: totals, coverage per shift, and the
 * list, searchable and filterable by status, shift and preferred role.
 */
export default async function VolunteerApplicationsPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  if (!(await requireAdminOrFestivalAdmin())) redirect("/");

  const parsed = ParamsSchema.safeParse(await props.params);
  if (!parsed.success) notFound();
  const festivalId = parsed.data.id;

  const searchParams = await props.searchParams;
  const filters = VolunteerApplicationsSearchSchema.parse(searchParams);

  const call = await fetchVolunteerAdminCall(festivalId);
  if (!call) notFound();
  const page = call.settings
    ? await fetchVolunteerApplicationsPage(festivalId, filters)
    : null;

  return (
    <VolunteerAdminListView
      call={call}
      page={page}
      filters={filters}
      searchParams={searchParams}
    />
  );
}
