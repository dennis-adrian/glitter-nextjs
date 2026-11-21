import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { parseVolunteerAdminView } from "@/app/components/volunteers/admin/volunteer-admin-list-params";
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
 * list, searchable and filterable by status, shift and preferred role. On
 * phones `view=cobertura` shows the coverage instead of the list.
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
  // A role or shift the call no longer has has no option in its filter, so
  // the list must not narrow by it either.
  if (!call.roles.some((role) => role.id === filters.roleId)) {
    filters.roleId = undefined;
  }
  if (!call.shifts.some((shift) => shift.id === filters.shiftId)) {
    filters.shiftId = undefined;
  }
  const page = call.settings
    ? await fetchVolunteerApplicationsPage(festivalId, filters)
    : null;

  return (
    <VolunteerAdminListView
      call={call}
      page={page}
      filters={filters}
      searchParams={searchParams}
      view={parseVolunteerAdminView(searchParams)}
    />
  );
}
