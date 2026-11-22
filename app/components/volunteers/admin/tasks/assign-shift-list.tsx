import Link from "next/link";

import { Badge } from "@/app/components/ui/badge";
import { Progress } from "@/app/components/ui/progress";
import { CoverageBadge } from "@/app/components/volunteers/admin/tasks/application-sections";
import { cn } from "@/app/lib/utils";
import { volunteerShiftAdminPath } from "@/app/lib/volunteers/admin-definitions";
import type {
  VolunteerTaskCall,
  VolunteerTaskShift,
} from "@/app/lib/volunteers/admin-task-queries";
import {
  coverageBadge,
  coveragePercent,
  plural,
  shiftsByNeed,
  volunteerAssignPath,
  volunteerPeoplePath,
} from "@/app/lib/volunteers/admin-tasks";
import { formatShiftWhenShort } from "@/app/lib/volunteers/format";

/** "Por turno | Por persona", with "3 sin turnos" beside the second. */
export function AssignModeNav({
  festivalId,
  mode,
  withoutShifts,
  className,
}: {
  festivalId: number;
  mode: "turno" | "persona";
  withoutShifts: number;
  className?: string;
}) {
  const tab = (active: boolean) =>
    cn(
      "-mb-px inline-flex min-h-11 items-center gap-1.5 border-b-2 px-3 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
      active
        ? "border-primary font-semibold text-foreground"
        : "border-transparent text-muted-foreground hover:text-foreground",
    );
  return (
    <nav
      aria-label="Cómo asignar"
      className={cn("flex min-w-0 flex-wrap gap-1 border-b", className)}
    >
      <Link
        href={volunteerAssignPath(festivalId)}
        aria-current={mode === "turno" ? "page" : undefined}
        className={tab(mode === "turno")}
      >
        Por turno
      </Link>
      <Link
        href={volunteerPeoplePath(festivalId)}
        aria-current={mode === "persona" ? "page" : undefined}
        className={tab(mode === "persona")}
      >
        Por persona
        {withoutShifts > 0 && (
          <Badge variant="amber">{withoutShifts} sin turnos</Badge>
        )}
      </Link>
    </nav>
  );
}

/** "Solo 4 aceptadas lo marcaron. Hay 5 pendientes que también." */
export function shortageLine(shift: VolunteerTaskShift) {
  const accepted = shift.acceptedUnassignedCount;
  const lead =
    accepted === 0
      ? "Ninguna aceptada lo marcó."
      : accepted === 1
        ? "Solo 1 aceptada lo marcó."
        : `Solo ${accepted} aceptadas lo marcaron.`;
  const pending = shift.pendingAvailableCount;
  if (pending === 0) return lead;
  return `${lead} Hay ${plural(pending, "pendiente", "pendientes")} que también.`;
}

/** Active roles nobody assigned to the shift holds. */
export function rolesMissing(
  shift: VolunteerTaskShift,
  roles: VolunteerTaskCall["roles"],
) {
  const held = new Set(shift.assignedRoleIds);
  return roles.filter((role) => role.isActive && !held.has(role.id));
}

/**
 * "Elegí un turno": the active shifts, those missing the most people first.
 * Cards with the shortage and the roles nobody covers on phones; rows in a
 * card beside the open shift on desktop.
 */
export default function AssignShiftList({
  festivalId,
  shifts,
  roles,
  selectedId,
  className,
}: {
  festivalId: number;
  shifts: VolunteerTaskShift[];
  roles: VolunteerTaskCall["roles"];
  selectedId?: number;
  className?: string;
}) {
  const ordered = shiftsByNeed(shifts);
  return (
    <section
      aria-labelledby="assign-shifts-title"
      className={cn(
        "flex min-w-0 flex-col gap-2 lg:gap-0 lg:overflow-hidden lg:rounded-lg lg:border lg:bg-card",
        className,
      )}
    >
      <h2
        id="assign-shifts-title"
        className="text-lg leading-7 font-semibold lg:px-4 lg:pt-4 lg:pb-2"
      >
        <span className="lg:hidden">Elegí un turno para sumarle personas</span>
        <span className="hidden lg:inline">Elegí un turno</span>
      </h2>
      {ordered.length === 0 ? (
        <p className="text-muted-foreground lg:border-t lg:px-4 lg:py-3">
          Todavía no hay turnos activos.
        </p>
      ) : (
        <ul className="flex flex-col gap-2 lg:gap-0">
          {ordered.map((shift) => {
            const badge = coverageBadge(shift);
            const missingRoles =
              badge.variant === "green" || shift.neededHeadcount <= 0
                ? []
                : rolesMissing(shift, roles);
            const selected = shift.id === selectedId;
            return (
              <li key={shift.id}>
                <Link
                  href={volunteerShiftAdminPath(festivalId, shift.id)}
                  aria-current={selected ? "true" : undefined}
                  className={cn(
                    "flex min-w-0 flex-col gap-2 rounded-lg border bg-card px-4 py-3 text-card-foreground shadow-xs transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    "lg:gap-1.5 lg:rounded-none lg:border-0 lg:border-t lg:shadow-none",
                    selected && "lg:bg-accent",
                  )}
                >
                  <span className="flex min-w-0 items-start gap-2">
                    <span className="min-w-0 flex-1 break-words">
                      <strong className="font-semibold">
                        {formatShiftWhenShort(shift)}
                      </strong>
                      <br />
                      <span className="text-muted-foreground">
                        {shift.label}
                      </span>
                    </span>
                    <CoverageBadge shift={shift} />
                  </span>
                  {shift.neededHeadcount > 0 && (
                    <Progress
                      value={coveragePercent(shift)}
                      aria-label={`${shift.assignedCount} de ${shift.neededHeadcount} asignados`}
                    />
                  )}
                  {badge.variant === "red" && (
                    <span className="break-words text-red-900 lg:hidden dark:text-red-200">
                      {shortageLine(shift)}
                    </span>
                  )}
                  {missingRoles.length > 0 && (
                    <span className="break-words text-muted-foreground lg:hidden">
                      Nadie en:{" "}
                      {missingRoles.map((role) => role.name).join(", ")}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
