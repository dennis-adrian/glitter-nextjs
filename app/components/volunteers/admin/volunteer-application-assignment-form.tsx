"use client";

import { DateTime } from "luxon";
import { TriangleAlertIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import { Checkbox } from "@/app/components/ui/checkbox";
import { Label } from "@/app/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { toastActionError } from "@/app/lib/errors/action-error";
import { STORE_TIMEZONE } from "@/app/lib/formatters";
import { cn } from "@/app/lib/utils";
import { updateVolunteerAssignment } from "@/app/lib/volunteers/admin-actions";
import {
  VOLUNTEER_ADMIN_COPY,
  canAssignVolunteer,
  daysOverShiftLimit,
  type VolunteerAdminRole,
  type VolunteerApplicationDetail,
  type VolunteerShiftCoverage,
} from "@/app/lib/volunteers/admin-definitions";
import { VOLUNTEER_MAX_SHIFTS_PER_DAY } from "@/app/lib/volunteers/definitions";
import {
  formatShiftDay,
  formatShiftWhen,
  formatWeekdayDate,
} from "@/app/lib/volunteers/format";

/** The select's value for "Sin rol": Radix refuses an empty value. */
const NO_ROLE = "none";

function laPazDay(date: Date) {
  return DateTime.fromJSDate(date, { zone: STORE_TIMEZONE }).toISODate() ?? "";
}

type ShiftDay = { day: string; shifts: VolunteerShiftCoverage[] };

/**
 * The shifts that can be offered, by La Paz day in time order: every active
 * shift, plus any inactive one the application already holds.
 */
export function assignableShiftDays(
  shifts: VolunteerShiftCoverage[],
  assignedShiftIds: readonly number[],
): ShiftDay[] {
  const days = new Map<string, VolunteerShiftCoverage[]>();
  const sorted = shifts
    .filter((shift) => shift.isActive || assignedShiftIds.includes(shift.id))
    .sort(
      (a, b) =>
        a.startsAt.getTime() - b.startsAt.getTime() ||
        a.sortOrder - b.sortOrder ||
        a.id - b.id,
    );
  for (const shift of sorted) {
    const day = laPazDay(shift.startsAt);
    days.set(day, [...(days.get(day) ?? []), shift]);
  }
  return [...days.entries()].map(([day, list]) => ({ day, shifts: list }));
}

/** The roles that can be given: active ones, plus the current one. */
export function assignableRoles(
  roles: VolunteerAdminRole[],
  assignedRoleId: number | null,
) {
  return roles.filter((role) => role.isActive || role.id === assignedRoleId);
}

/**
 * The role and shifts given to an accepted application. Any active shift may
 * be given, at most VOLUNTEER_MAX_SHIFTS_PER_DAY per day; the ones the
 * applicant did not mark say so.
 */
export default function VolunteerApplicationAssignmentForm({
  festivalId,
  application,
  roles,
  shifts,
}: {
  festivalId: number;
  application: Pick<
    VolunteerApplicationDetail,
    | "id"
    | "status"
    | "assignedRoleId"
    | "availableShiftIds"
    | "assignedShiftIds"
  >;
  roles: VolunteerAdminRole[];
  shifts: VolunteerShiftCoverage[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [roleId, setRoleId] = useState<number | null>(
    application.assignedRoleId,
  );
  const [selected, setSelected] = useState<number[]>(
    application.assignedShiftIds,
  );

  const unlocked = canAssignVolunteer(application.status);
  const roleOptions = assignableRoles(roles, application.assignedRoleId);
  const days = useMemo(
    () => assignableShiftDays(shifts, application.assignedShiftIds),
    [shifts, application.assignedShiftIds],
  );
  const selectedShifts = shifts.filter((shift) => selected.includes(shift.id));
  const overDays = daysOverShiftLimit(selectedShifts);
  const overNames = overDays.map((day) => {
    const shift = selectedShifts.find((s) => laPazDay(s.startsAt) === day);
    return shift ? formatWeekdayDate(shift.startsAt) : day;
  });

  function toggle(shiftId: number, checked: boolean) {
    setSelected((current) =>
      checked
        ? [...current.filter((id) => id !== shiftId), shiftId]
        : current.filter((id) => id !== shiftId),
    );
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!unlocked || overDays.length > 0) return;
    startTransition(async () => {
      try {
        const result = await updateVolunteerAssignment({
          festivalId,
          applicationId: application.id,
          roleId,
          shiftIds: selected,
        });
        if (result.success) {
          toast.success(result.message);
          router.refresh();
        } else {
          toast.error(result.message);
        }
      } catch (error) {
        toastActionError(error, VOLUNTEER_ADMIN_COPY.genericError);
      }
    });
  }

  const disabled = !unlocked || isPending;

  return (
    <form onSubmit={save} className="flex min-w-0 flex-col gap-4">
      {!unlocked && (
        <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          {VOLUNTEER_ADMIN_COPY.assignmentLocked}
        </p>
      )}

      <div className="flex min-w-0 flex-col gap-1">
        <Label htmlFor="volunteer-assigned-role">Rol asignado</Label>
        <Select
          value={roleId == null ? NO_ROLE : `${roleId}`}
          onValueChange={(value) =>
            setRoleId(value === NO_ROLE ? null : Number(value))
          }
          disabled={disabled}
        >
          <SelectTrigger
            id="volunteer-assigned-role"
            className="min-w-0 sm:w-72"
          >
            <SelectValue placeholder="Sin rol" />
          </SelectTrigger>
          <SelectContent className="max-w-[min(var(--radix-select-content-available-width),calc(100vw-2rem))]">
            <SelectItem value={NO_ROLE}>Sin rol</SelectItem>
            {roleOptions.map((role) => (
              <SelectItem
                key={role.id}
                value={`${role.id}`}
                className="break-words"
              >
                {role.isActive ? role.name : `${role.name} (inactivo)`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <fieldset className="flex min-w-0 flex-col gap-3" disabled={disabled}>
        <legend className="mb-1 text-sm font-medium">
          Turnos asignados{" "}
          <span className="font-normal text-muted-foreground">
            (máximo {VOLUNTEER_MAX_SHIFTS_PER_DAY} por día)
          </span>
        </legend>
        {days.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No hay turnos activos para asignar.
          </p>
        )}
        {days.map(({ day, shifts: dayShifts }) => {
          const over = overDays.includes(day);
          return (
            <div key={day} className="flex min-w-0 flex-col gap-1.5">
              <h3
                className={cn(
                  "text-xs font-semibold tracking-wide text-muted-foreground uppercase",
                  over && "text-destructive",
                )}
              >
                {formatShiftDay(dayShifts[0]!.startsAt)}
              </h3>
              <ul className="flex min-w-0 flex-col gap-1.5">
                {dayShifts.map((shift) => {
                  const inputId = `volunteer-assign-shift-${shift.id}`;
                  const available = application.availableShiftIds.includes(
                    shift.id,
                  );
                  return (
                    <li
                      key={shift.id}
                      data-shift-id={shift.id}
                      className="flex min-w-0 items-start gap-2 rounded-md border p-2"
                    >
                      <Checkbox
                        id={inputId}
                        className="mt-0.5"
                        checked={selected.includes(shift.id)}
                        disabled={disabled}
                        onCheckedChange={(checked) =>
                          toggle(shift.id, checked === true)
                        }
                      />
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <Label
                          htmlFor={inputId}
                          className="text-sm font-normal break-words"
                        >
                          <span className="tabular-nums">
                            {formatShiftWhen(shift)}
                          </span>{" "}
                          — {shift.label}
                          {!shift.isActive && (
                            <span className="text-muted-foreground">
                              {" "}
                              (inactivo)
                            </span>
                          )}
                        </Label>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                          <span className="text-muted-foreground tabular-nums">
                            {shift.assignedCount}/{shift.neededHeadcount}{" "}
                            asignados
                          </span>
                          {available ? (
                            <span className="rounded-full bg-green-100 px-2 py-0.5 font-medium text-green-800 dark:bg-green-900/40 dark:text-green-200">
                              Disponible
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
                              <TriangleAlertIcon
                                aria-hidden="true"
                                className="h-3.5 w-3.5 shrink-0"
                              />
                              {VOLUNTEER_ADMIN_COPY.notAvailableWarning}
                            </span>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </fieldset>

      {overDays.length > 0 && (
        <p
          role="alert"
          className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm break-words text-destructive"
        >
          Máximo {VOLUNTEER_MAX_SHIFTS_PER_DAY} turnos por día: revisá{" "}
          {joinSpanish(overNames.map((name) => `el ${name}`))}.
        </p>
      )}

      <Button
        type="submit"
        size="sm"
        className="self-start"
        disabled={disabled || overDays.length > 0}
      >
        {isPending ? "Guardando..." : "Guardar asignación"}
      </Button>
    </form>
  );
}

function joinSpanish(items: string[]) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} y ${items.at(-1)}`;
}
