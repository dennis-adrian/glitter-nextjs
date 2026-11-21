import { DownloadIcon } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/app/components/ui/button";
import { Card, CardContent, CardHeader } from "@/app/components/ui/card";
import VolunteerApplicationsFilters from "@/app/components/volunteers/admin/volunteer-applications-filters";
import VolunteerApplicationsList from "@/app/components/volunteers/admin/volunteer-applications-list";
import VolunteerCoverageCard from "@/app/components/volunteers/admin/volunteer-coverage-card";
import VolunteerStatsCards from "@/app/components/volunteers/admin/volunteer-stats-cards";
import type { RawSearchParams } from "@/app/lib/credits/admin-definitions";
import { cn } from "@/app/lib/utils";
import {
  volunteerAdminPath,
  volunteerSetupAdminPath,
  type VolunteerAdminCall,
  type VolunteerApplicationsFilters as Filters,
  type VolunteerApplicationsPage,
} from "@/app/lib/volunteers/admin-definitions";
import { formatCloseDate } from "@/app/lib/volunteers/format";

/** The CSV of every application (route handler beside this page). */
export const volunteerExportPath = (festivalId: number) =>
  `${volunteerAdminPath(festivalId)}/export`;

/** "Postulaciones para Glitter v11. La convocatoria cierra el lunes…" */
export function volunteerListDescription(
  call: Pick<VolunteerAdminCall, "festival" | "settings">,
  now: Date = new Date(),
) {
  const lead = `Postulaciones para ${call.festival.name}.`;
  if (!call.settings) return lead;
  const close = formatCloseDate(call.settings.applicationsCloseAt);
  const verb =
    call.settings.applicationsCloseAt.getTime() <= now.getTime()
      ? "cerró"
      : "cierra";
  return `${lead} La convocatoria ${verb} el ${close.weekdayDate} a las ${close.time}.`;
}

/** Header buttons: full width and 44px tall on phones, wrapping. */
const headerButtonClass = "min-h-11 flex-1 basis-40 md:min-h-10 md:flex-none";

/**
 * /dashboard/festivals/[id]/volunteers, from plain data: the header, the
 * stat tiles, "Cobertura por turno" and the "Postulaciones" card. Without a
 * configured call, an empty state that leads to the setup page.
 */
export default function VolunteerAdminListView({
  call,
  page,
  filters,
  searchParams,
  today,
}: {
  call: VolunteerAdminCall;
  /** Null while the call has no settings. */
  page: VolunteerApplicationsPage | null;
  filters: Filters;
  searchParams: RawSearchParams;
  /** "Now", for the ages and whether the call closed; stories pin it. */
  today?: Date;
}) {
  const festivalId = call.festival.id;
  const basePath = volunteerAdminPath(festivalId);
  const setupPath = volunteerSetupAdminPath(festivalId);

  return (
    <div className="container flex min-w-0 flex-col gap-4 p-3 pb-10 md:p-6">
      <div className="flex min-w-0 flex-col gap-3 md:flex-row md:flex-wrap md:items-end md:justify-between">
        <div className="min-w-0">
          <h1
            className="text-2xl font-bold md:text-3xl"
            data-installed-title=""
          >
            Voluntarios
          </h1>
          <p className="mt-1 break-words text-muted-foreground">
            {volunteerListDescription(call, today)}
          </p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Link
            href={setupPath}
            className={cn(
              buttonVariants({ variant: "outline", wrap: true }),
              headerButtonClass,
            )}
          >
            Roles, turnos y fechas
          </Link>
          {page && (
            <a
              href={volunteerExportPath(festivalId)}
              download
              className={cn(
                buttonVariants({ variant: "secondary", wrap: true }),
                "gap-2",
                headerButtonClass,
              )}
            >
              <DownloadIcon aria-hidden="true" className="h-4 w-4 shrink-0" />
              Exportar CSV
            </a>
          )}
        </div>
      </div>

      {!page ? (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-6">
          <div className="space-y-1">
            <h2 className="font-semibold">Todavía no hay convocatoria</h2>
            <p className="text-sm text-muted-foreground">
              Definí la fecha de cierre, los roles y los turnos para empezar a
              recibir postulaciones.
            </p>
          </div>
          <Link
            href={setupPath}
            className={buttonVariants({
              wrap: true,
              className: "min-h-11 md:min-h-10",
            })}
          >
            Configurá la convocatoria
          </Link>
        </div>
      ) : (
        <>
          <VolunteerStatsCards totals={call.statusTotals} />
          <VolunteerCoverageCard shifts={call.shifts} />
          <Card
            role="region"
            aria-labelledby="volunteer-applications-title"
            className="max-md:border-0 max-md:bg-transparent max-md:shadow-none"
          >
            <CardHeader className="gap-3 space-y-0 px-0 pt-2 pb-3 md:p-6 md:pb-3">
              <h2
                id="volunteer-applications-title"
                className="text-lg leading-tight font-semibold"
              >
                Postulaciones
              </h2>
              <VolunteerApplicationsFilters
                basePath={basePath}
                searchParams={searchParams}
                filters={filters}
                counts={page.counts}
              />
            </CardHeader>
            <CardContent className="p-0 md:p-6 md:pt-0">
              <VolunteerApplicationsList
                festivalId={festivalId}
                items={page.items}
                total={page.total}
                filters={filters}
                roles={call.roles}
                shifts={call.shifts}
                today={today}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
