import Link from "next/link";
import type { ReactNode } from "react";

import { buttonVariants } from "@/app/components/ui/button";
import VolunteerMoreOptionsMenu from "@/app/components/volunteers/admin/tasks/more-options-menu";
import { cn } from "@/app/lib/utils";
import {
  volunteerAdminPath,
  volunteerSetupAdminPath,
} from "@/app/lib/volunteers/admin-definitions";
import type { VolunteerTaskCall } from "@/app/lib/volunteers/admin-task-queries";
import {
  remainingPlaces,
  volunteerAllApplicationsPath,
  volunteerAssignPath,
  volunteerCloseLine,
} from "@/app/lib/volunteers/admin-tasks";

export type VolunteerTask = "revisar" | "asignar";

/** The CSV of every application (route handler beside the pages). */
export const volunteerExportHref = (festivalId: number) =>
  `${volunteerAdminPath(festivalId)}/export`;

/**
 * "Revisar 31 | Asignar 24": the two tasks, each with its count (pending
 * applications; places still to fill).
 */
export function VolunteerTaskSwitch({
  festivalId,
  task,
  pending,
  places,
  className,
}: {
  festivalId: number;
  task: VolunteerTask;
  pending: number;
  places: number;
  className?: string;
}) {
  const items = [
    {
      key: "revisar",
      label: "Revisar",
      count: pending,
      href: volunteerAdminPath(festivalId),
    },
    {
      key: "asignar",
      label: "Asignar",
      count: places,
      href: volunteerAssignPath(festivalId),
    },
  ] as const;
  return (
    <nav
      aria-label="Tarea"
      className={cn("flex gap-1 rounded-full bg-muted p-1", className)}
    >
      {items.map((item) => {
        const active = item.key === task;
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 min-w-0 flex-1 basis-0 items-center justify-center gap-1.5 rounded-full px-3 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              active
                ? "bg-card font-semibold text-foreground shadow-xs"
                : "font-medium text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label} <span className="tabular-nums">{item.count}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** The grey line under the switch. */
export function VolunteerStrip({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "rounded-md bg-muted px-3 py-2.5 break-words text-foreground",
        className,
      )}
    >
      {children}
    </p>
  );
}

const headerButton = "min-h-10";

/**
 * The part of the header no task changes: "Voluntarios", when the call
 * closes, the settings, export and every application (a "…" menu on phones).
 */
export function VolunteerHeaderTop({
  call,
  now,
}: {
  call: VolunteerTaskCall;
  now?: Date;
}) {
  const festivalId = call.festival.id;
  const setupHref = volunteerSetupAdminPath(festivalId);
  const allHref = volunteerAllApplicationsPath(festivalId);
  const exportHref = call.settings ? volunteerExportHref(festivalId) : null;
  const closeAt = call.settings?.applicationsCloseAt;

  return (
    <div className="flex min-w-0 items-start justify-between gap-2 lg:flex-wrap lg:items-end lg:gap-3">
      <div className="min-w-0">
        <h1
          className="font-display text-2xl leading-8 font-bold lg:text-3xl"
          data-installed-title=""
        >
          Voluntarios
        </h1>
        {closeAt && (
          <>
            <p className="mt-0.5 break-words text-muted-foreground lg:hidden">
              {volunteerCloseLine(closeAt, now)}
            </p>
            <p className="mt-1 hidden break-words text-muted-foreground lg:block">
              Postulaciones para {call.festival.name}.{" "}
              {volunteerCloseLine(closeAt, now, { long: true })}
            </p>
          </>
        )}
      </div>
      <VolunteerMoreOptionsMenu
        setupHref={setupHref}
        exportHref={exportHref}
        allHref={allHref}
        className="shrink-0 lg:hidden"
      />
      <div className="hidden min-w-0 flex-wrap items-center gap-2 lg:flex">
        <Link
          href={allHref}
          className={buttonVariants({
            variant: "ghost",
            wrap: true,
            className: headerButton,
          })}
        >
          Todas las postulaciones
        </Link>
        <Link
          href={setupHref}
          className={buttonVariants({
            variant: "outline",
            wrap: true,
            className: headerButton,
          })}
        >
          Roles, turnos y fechas
        </Link>
        {exportHref && (
          <a
            href={exportHref}
            download
            className={buttonVariants({
              variant: "secondary",
              wrap: true,
              className: headerButton,
            })}
          >
            Exportar CSV
          </a>
        )}
      </div>
    </div>
  );
}

/** The task switch and, beside it on desktop, `strip`. */
export function VolunteerTaskBar({
  festivalId,
  task,
  pending,
  places,
  strip,
}: {
  festivalId: number;
  task: VolunteerTask;
  pending: number;
  places: number;
  strip?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3.5 lg:flex-row lg:flex-wrap lg:items-center lg:gap-3">
      <VolunteerTaskSwitch
        festivalId={festivalId}
        task={task}
        pending={pending}
        places={places}
        className="lg:max-w-90 lg:flex-[0_1_22.5rem]"
      />
      {strip && <div className="min-w-0 lg:flex-[1_1_20rem]">{strip}</div>}
    </div>
  );
}

/**
 * The top of Revisar and Asignar: `VolunteerHeaderTop`, then the task
 * switch and `strip`. In the app the frame of both tasks composes the two
 * parts itself, so switching tasks keeps the top.
 */
export default function VolunteerTaskHeader({
  call,
  task,
  strip,
  now,
  className,
}: {
  call: VolunteerTaskCall;
  task: VolunteerTask;
  strip?: ReactNode;
  now?: Date;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-3.5 lg:gap-4", className)}>
      <VolunteerHeaderTop call={call} now={now} />
      <VolunteerTaskBar
        festivalId={call.festival.id}
        task={task}
        pending={call.statusTotals.pending}
        places={remainingPlaces(call.shifts).places}
        strip={strip}
      />
    </div>
  );
}
