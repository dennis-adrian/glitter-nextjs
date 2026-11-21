"use client";

import { DateTime } from "luxon";
import { TriangleAlertIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useId, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Banner } from "@/app/components/ui/banner";
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
import { Textarea } from "@/app/components/ui/textarea";
import { toastActionError } from "@/app/lib/errors/action-error";
import { STORE_TIMEZONE, formatDisplayDate } from "@/app/lib/formatters";
import { cn } from "@/app/lib/utils";
import { saveVolunteerReview } from "@/app/lib/volunteers/admin-actions";
import {
  VOLUNTEER_ADMIN_COPY,
  VOLUNTEER_APPLICATION_STATUSES,
  VOLUNTEER_STATUS_LABELS,
  canAssignVolunteer,
  daysOverShiftLimit,
  type VolunteerAdminRole,
  type VolunteerApplicationDetail,
  type VolunteerShiftCoverage,
} from "@/app/lib/volunteers/admin-definitions";
import { VOLUNTEER_ADMIN_NOTES_MAX_LENGTH } from "@/app/lib/volunteers/admin-schema";
import {
  VOLUNTEER_MAX_SHIFTS_PER_DAY,
  type VolunteerApplicationStatus,
} from "@/app/lib/volunteers/definitions";
import {
  compareShiftsByStart,
  formatShiftWhen,
} from "@/app/lib/volunteers/format";

/** The role select's value for "Sin asignar": Radix refuses an empty one. */
const NO_ROLE = "none";

function laPaz(date: Date) {
  return DateTime.fromJSDate(date, { zone: STORE_TIMEZONE }).setLocale("es");
}

/**
 * The shifts the form offers, in time order: first the ones the application
 * holds or the applicant marked, then the rest behind "Ver los otros N
 * turnos". Every active shift, plus any inactive one it already holds.
 */
export function reviewShiftGroups(
  shifts: VolunteerShiftCoverage[],
  application: Pick<
    VolunteerApplicationDetail,
    "availableShiftIds" | "assignedShiftIds"
  >,
) {
  const offered = shifts
    .filter(
      (shift) =>
        shift.isActive || application.assignedShiftIds.includes(shift.id),
    )
    .sort(compareShiftsByStart);
  const first = (shift: VolunteerShiftCoverage) =>
    application.assignedShiftIds.includes(shift.id) ||
    application.availableShiftIds.includes(shift.id);
  return {
    primary: offered.filter(first),
    others: offered.filter((shift) => !first(shift)),
  };
}

/**
 * The roles the select offers: the applicant's 1st and 2nd choices first,
 * marked as such, then the rest in their order. Active ones, plus the one
 * already assigned.
 */
export function reviewRoleOptions(
  roles: VolunteerAdminRole[],
  application: Pick<
    VolunteerApplicationDetail,
    "firstChoiceRoleId" | "secondChoiceRoleId" | "assignedRoleId"
  >,
) {
  const offered = roles
    .filter((role) => role.isActive || role.id === application.assignedRoleId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  const rank = (id: number) =>
    id === application.firstChoiceRoleId
      ? 0
      : id === application.secondChoiceRoleId
        ? 1
        : 2;
  return offered
    .map((role) => ({ role, rank: rank(role.id) }))
    .sort((a, b) => a.rank - b.rank)
    .map(({ role, rank: choice }) => ({
      id: role.id,
      label: [
        role.name,
        choice === 0
          ? " (su 1ª opción)"
          : choice === 1
            ? " (su 2ª opción)"
            : "",
        role.isActive ? "" : " (inactivo)",
      ].join(""),
    }));
}

/**
 * The amber notice over the selection, which never blocks the save: days past
 * the recommended VOLUNTEER_MAX_SHIFTS_PER_DAY (the public rule; admins may
 * make exceptions) and shifts the applicant did not mark.
 */
export function reviewWarning(
  selected: VolunteerShiftCoverage[],
  availableShiftIds: readonly number[],
): string | null {
  const overDays = daysOverShiftLimit(selected);
  const notMarked = selected
    .filter((shift) => !availableShiftIds.includes(shift.id))
    .sort(compareShiftsByStart);
  if (overDays.length === 0 && notMarked.length === 0) return null;

  if (overDays.length > 0) {
    const perDay = overDays.map((day) => {
      const onDay = selected.filter(
        (shift) => laPaz(shift.startsAt).toISODate() === day,
      );
      return `${onDay.length} turnos asignados el ${laPaz(onDay[0]!.startsAt).toFormat("cccc d")}`;
    });
    const unmarked =
      notMarked.length === 0
        ? ""
        : notMarked.length === 1
          ? " y uno de ellos no lo marcó como disponible"
          : ` y ${notMarked.length} de ellos no los marcó como disponibles`;
    return `Tiene ${joinSpanish(perDay)}${unmarked}. El máximo recomendado es ${VOLUNTEER_MAX_SHIFTS_PER_DAY} por día. Podés guardar igual.`;
  }
  const unmarked =
    notMarked.length === 1
      ? `El turno del ${formatShiftWhen(notMarked[0]!)} no lo marcó como disponible.`
      : `${notMarked.length} de los turnos asignados no los marcó como disponibles.`;
  return `${unmarked} Podés guardar igual.`;
}

function joinSpanish(items: string[]) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} y ${items.at(-1)}`;
}

const sameIds = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();

/**
 * "Decisión y asignación": the status, the role and shifts (only once
 * accepted) and the team's notes, saved together with saveVolunteerReview.
 * Remount it (key) when the stored application changes.
 */
export default function VolunteerReviewForm({
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
    | "firstChoiceRoleId"
    | "secondChoiceRoleId"
    | "assignedRoleId"
    | "availableShiftIds"
    | "assignedShiftIds"
    | "adminNotes"
    | "reviewedBy"
    | "reviewedAt"
  >;
  roles: VolunteerAdminRole[];
  shifts: VolunteerShiftCoverage[];
}) {
  const id = useId();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<VolunteerApplicationStatus>(
    application.status,
  );
  const [roleId, setRoleId] = useState<number | null>(
    application.assignedRoleId,
  );
  const [selected, setSelected] = useState<number[]>(
    application.assignedShiftIds,
  );
  const [notes, setNotes] = useState(application.adminNotes ?? "");
  const [showOthers, setShowOthers] = useState(false);

  const unlocked = canAssignVolunteer(status);
  const roleOptions = useMemo(
    () => reviewRoleOptions(roles, application),
    [roles, application],
  );
  const groups = useMemo(
    () => reviewShiftGroups(shifts, application),
    [shifts, application],
  );
  const visible = showOthers
    ? [...groups.primary, ...groups.others]
    : groups.primary;
  const selectedShifts = shifts.filter((shift) => selected.includes(shift.id));
  const warning = unlocked
    ? reviewWarning(selectedShifts, application.availableShiftIds)
    : null;

  const dirty =
    status !== application.status ||
    notes.trim() !== (application.adminNotes ?? "").trim() ||
    (unlocked &&
      (roleId !== application.assignedRoleId ||
        !sameIds(selected, application.assignedShiftIds)));

  /** The shift's assigned count with this form's choice in place of the stored one. */
  function assignedCount(shift: VolunteerShiftCoverage) {
    const stored =
      canAssignVolunteer(application.status) &&
      application.assignedShiftIds.includes(shift.id);
    const now = unlocked && selected.includes(shift.id);
    return shift.assignedCount - (stored ? 1 : 0) + (now ? 1 : 0);
  }

  function toggle(shiftId: number, checked: boolean) {
    setSelected((current) =>
      checked
        ? [...current.filter((value) => value !== shiftId), shiftId]
        : current.filter((value) => value !== shiftId),
    );
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dirty) return;
    startTransition(async () => {
      try {
        const result = await saveVolunteerReview({
          festivalId,
          applicationId: application.id,
          status,
          roleId,
          shiftIds: selected,
          adminNotes: notes,
        });
        if (result.success) {
          if (result.warning) toast.warning(result.warning);
          else toast.success(result.message);
          router.refresh();
        } else {
          toast.error(result.message);
        }
      } catch (error) {
        toastActionError(error, VOLUNTEER_ADMIN_COPY.genericError);
      }
    });
  }

  const statusId = `${id}-status`;
  const roleSelectId = `${id}-role`;
  const notesId = `${id}-notes`;
  const lockedId = `${id}-locked`;
  const warningId = `${id}-warning`;
  const assignDisabled = !unlocked || isPending;

  return (
    <form onSubmit={save} className="flex min-w-0 flex-col gap-4">
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor={statusId}>Estado</Label>
        <Select
          value={status}
          onValueChange={(value) =>
            setStatus(value as VolunteerApplicationStatus)
          }
          disabled={isPending}
        >
          <SelectTrigger id={statusId} className="min-h-11 md:min-h-10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VOLUNTEER_APPLICATION_STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                {VOLUNTEER_STATUS_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!unlocked && (
        <p
          id={lockedId}
          className="rounded-md border border-dashed p-3 text-sm text-muted-foreground"
        >
          {VOLUNTEER_ADMIN_COPY.assignmentLocked}
        </p>
      )}

      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor={roleSelectId}>Rol asignado</Label>
        <Select
          value={roleId == null ? NO_ROLE : `${roleId}`}
          onValueChange={(value) =>
            setRoleId(value === NO_ROLE ? null : Number(value))
          }
          disabled={assignDisabled}
        >
          <SelectTrigger
            id={roleSelectId}
            aria-describedby={unlocked ? undefined : lockedId}
            className="h-auto min-h-11 min-w-0 text-left md:min-h-10 [&>span]:line-clamp-none [&>span]:break-words [&>span]:whitespace-normal"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-w-[min(var(--radix-select-content-available-width),calc(100vw-2rem))]">
            <SelectItem value={NO_ROLE}>
              {VOLUNTEER_ADMIN_COPY.unassigned}
            </SelectItem>
            {roleOptions.map((option) => (
              <SelectItem
                key={option.id}
                value={`${option.id}`}
                className="break-words whitespace-normal"
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <fieldset
        className="flex min-w-0 flex-col gap-2"
        disabled={assignDisabled}
        aria-describedby={
          [unlocked ? null : lockedId, warning ? warningId : null]
            .filter(Boolean)
            .join(" ") || undefined
        }
      >
        <legend className="mb-2 text-sm font-medium">Turnos asignados</legend>
        {visible.length === 0 && groups.others.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No hay turnos activos para asignar.
          </p>
        )}
        {visible.map((shift) => {
          const inputId = `${id}-shift-${shift.id}`;
          const checked = selected.includes(shift.id);
          const marked = application.availableShiftIds.includes(shift.id);
          return (
            <Label
              key={shift.id}
              htmlFor={inputId}
              data-shift-id={shift.id}
              className={cn(
                "flex min-w-0 cursor-pointer items-start gap-3 rounded-lg border bg-card p-3 text-sm leading-5 font-normal",
                checked && unlocked && "border-primary bg-primary/5",
                assignDisabled && "cursor-not-allowed opacity-70",
              )}
            >
              <Checkbox
                id={inputId}
                className="mt-0.5"
                checked={checked}
                disabled={assignDisabled}
                onCheckedChange={(value) => toggle(shift.id, value === true)}
              />
              <span className="min-w-0 flex-1 break-words">
                <strong className="font-semibold tabular-nums">
                  {formatShiftWhen(shift)}
                </strong>
                <br />
                {shift.label}
                {" · "}
                <span className="tabular-nums">
                  {assignedCount(shift)} de {shift.neededHeadcount}
                </span>
                {!shift.isActive && " · inactivo"}
                {!marked && (
                  <span className="text-amber-800 dark:text-amber-300">
                    {" · "}
                    {VOLUNTEER_ADMIN_COPY.notMarked}
                  </span>
                )}
              </span>
            </Label>
          );
        })}
        {groups.others.length > 0 && (
          <Button
            type="button"
            variant="link"
            wrap
            className="h-auto min-h-11 self-start px-0 md:min-h-8"
            aria-expanded={showOthers}
            onClick={() => setShowOthers((value) => !value)}
          >
            {showOthers
              ? "Ocultar los otros turnos"
              : groups.others.length === 1
                ? "Ver el otro turno"
                : `Ver los otros ${groups.others.length} turnos`}
          </Button>
        )}
      </fieldset>

      {warning && (
        <div id={warningId} role="status" className="min-w-0">
          <Banner variant="warning" icon={TriangleAlertIcon}>
            <span className="break-words">{warning}</span>
          </Banner>
        </div>
      )}

      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor={notesId}>Notas internas</Label>
        <Textarea
          id={notesId}
          value={notes}
          maxLength={VOLUNTEER_ADMIN_NOTES_MAX_LENGTH}
          rows={4}
          placeholder={VOLUNTEER_ADMIN_COPY.notesPlaceholder}
          disabled={isPending}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        <Button
          type="submit"
          wrap
          className="min-h-11 w-full md:min-h-10"
          disabled={isPending || !dirty}
        >
          {isPending ? "Guardando..." : "Guardar cambios"}
        </Button>
        {application.reviewedBy && application.reviewedAt && (
          <p className="text-xs break-words text-muted-foreground">
            Última revisión: {application.reviewedBy.displayName},{" "}
            {formatDisplayDate(application.reviewedAt, DateTime.DATETIME_MED)}
          </p>
        )}
      </div>
    </form>
  );
}
