import { DownloadIcon } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/app/components/ui/button";
import { Card, CardContent, CardHeader } from "@/app/components/ui/card";
import {
  VOLUNTEER_ADMIN_VIEWS,
  volunteerViewHref,
  type VolunteerAdminView,
} from "@/app/components/volunteers/admin/volunteer-admin-list-params";
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
import { volunteerAllApplicationsPath } from "@/app/lib/volunteers/admin-tasks";
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

const VIEW_LABELS: Record<VolunteerAdminView, string> = {
  postulaciones: "Postulaciones",
  cobertura: "Cobertura",
};

/**
 * Phones only: "Postulaciones | Cobertura", a segmented control of links so
 * the view survives a reload and back. From md both cards show at once.
 */
function VolunteerViewTabs({
  basePath,
  searchParams,
  view,
}: {
  basePath: string;
  searchParams: RawSearchParams;
  view: VolunteerAdminView;
}) {
  return (
    <nav
      aria-label="Vistas de voluntarios"
      className="flex gap-1 rounded-full bg-muted p-1 md:hidden"
    >
      {VOLUNTEER_ADMIN_VIEWS.map((option) => {
        const active = option === view;
        return (
          <Link
            key={option}
            href={volunteerViewHref(basePath, searchParams, option)}
            scroll={false}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 min-w-0 flex-1 basis-0 items-center justify-center rounded-full px-3 text-center text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              active
                ? "bg-card font-semibold text-foreground shadow-xs"
                : "font-medium text-muted-foreground hover:text-foreground",
            )}
          >
            {VIEW_LABELS[option]}
          </Link>
        );
      })}
    </nav>
  );
}

/** Header buttons: full width and 44px tall on phones, wrapping. */
const headerButtonClass = "min-h-11 flex-1 basis-40 md:min-h-10 md:flex-none";

/**
 * /dashboard/festivals/[id]/volunteers, from plain data: the header, the
 * stat tiles, "Cobertura por turno" and the "Postulaciones" card. On phones
 * the two cards are separate views (`view`), switched under the tiles.
 * Without a configured call, an empty state that leads to the setup page.
 */
export default function VolunteerAdminListView({
  call,
  page,
  filters,
  searchParams,
  view = "postulaciones",
  today,
}: {
  call: VolunteerAdminCall;
  /** Null while the call has no settings. */
  page: VolunteerApplicationsPage | null;
  filters: Filters;
  searchParams: RawSearchParams;
  /** Which card phones show; md and up show both. */
  view?: VolunteerAdminView;
  /** "Now", for the ages and whether the call closed; stories pin it. */
  today?: Date;
}) {
  const festivalId = call.festival.id;
  const basePath = volunteerAllApplicationsPath(festivalId);
  const setupPath = volunteerSetupAdminPath(festivalId);

  return (
    <div className="container flex min-w-0 flex-col gap-4 p-3 pb-10 md:p-6">
      <div className="flex min-w-0 flex-col gap-3 md:flex-row md:flex-wrap md:items-end md:justify-between">
        <div className="min-w-0">
          <h1
            className="text-2xl font-bold md:text-3xl"
            data-installed-title=""
          >
            Todas las postulaciones
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
          <VolunteerViewTabs
            basePath={basePath}
            searchParams={searchParams}
            view={view}
          />
          <VolunteerCoverageCard
            festivalId={festivalId}
            shifts={call.shifts}
            className={cn(view !== "cobertura" && "max-md:hidden")}
          />
          <Card
            role="region"
            aria-labelledby="volunteer-applications-title"
            className={cn(
              "max-md:border-0 max-md:bg-transparent max-md:shadow-none",
              view !== "postulaciones" && "max-md:hidden",
            )}
          >
            <CardHeader className="gap-3 space-y-0 px-0 pt-2 pb-3 md:p-6 md:pb-3">
              <h2
                id="volunteer-applications-title"
                className="text-lg leading-tight font-semibold max-md:sr-only"
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
