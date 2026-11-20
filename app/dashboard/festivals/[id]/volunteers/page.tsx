import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { buttonVariants } from "@/app/components/ui/button";
import VolunteerAdminTabs from "@/app/components/volunteers/admin/volunteer-admin-tabs";
import VolunteerApplicationsFilters from "@/app/components/volunteers/admin/volunteer-applications-filters";
import VolunteerApplicationsList from "@/app/components/volunteers/admin/volunteer-applications-list";
import VolunteerApplicationsStatusTabs from "@/app/components/volunteers/admin/volunteer-applications-status-tabs";
import type { RawSearchParams } from "@/app/lib/credits/admin-definitions";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";
import {
  VolunteerApplicationsSearchSchema,
  volunteerSetupAdminPath,
} from "@/app/lib/volunteers/admin-definitions";
import {
  fetchVolunteerAdminCall,
  fetchVolunteerApplicationsPage,
} from "@/app/lib/volunteers/admin-queries";

const ParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const metadata: Metadata = { title: "Voluntarios" };

/**
 * The festival's volunteer applications: one inbox per status, searchable
 * and filterable by role and shift, each row opening the application.
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
    <div className="container flex min-w-0 flex-col gap-4 p-3 pb-10 md:gap-6 md:p-6">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold" data-installed-title="">
            Voluntarios
          </h1>
          <p className="text-sm break-words text-muted-foreground">
            {call.festival.name}
          </p>
        </div>
        <VolunteerAdminTabs festivalId={festivalId} />
      </div>

      {!page ? (
        <div className="flex flex-col items-start gap-3 rounded-md border border-dashed p-6">
          <div className="space-y-1">
            <h2 className="font-semibold">Todavía no hay convocatoria</h2>
            <p className="text-sm text-muted-foreground">
              Definí la fecha de cierre, los roles y los turnos para empezar a
              recibir postulaciones.
            </p>
          </div>
          <Link
            href={volunteerSetupAdminPath(festivalId)}
            className={buttonVariants({ size: "sm", wrap: true })}
          >
            Configurá la convocatoria
          </Link>
        </div>
      ) : (
        <div className="flex min-w-0 flex-col gap-4">
          <VolunteerApplicationsStatusTabs
            status={filters.status}
            counts={page.counts}
            searchParams={searchParams}
          />
          <VolunteerApplicationsFilters
            roles={call.roles}
            shifts={call.shifts}
          />
          <VolunteerApplicationsList
            festivalId={festivalId}
            items={page.items}
            total={page.total}
            filters={filters}
          />
        </div>
      )}
    </div>
  );
}
