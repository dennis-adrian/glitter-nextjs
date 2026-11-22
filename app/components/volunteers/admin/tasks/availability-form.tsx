"use client";

import { ArrowLeftIcon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { CoverageBadge } from "@/app/components/volunteers/admin/tasks/application-sections";
import ChoiceRow from "@/app/components/volunteers/admin/tasks/choice-row";
import { updateVolunteerAvailability } from "@/app/lib/volunteers/admin-actions";
import type { VolunteerApplicationDetail } from "@/app/lib/volunteers/admin-definitions";
import type { VolunteerTaskShift } from "@/app/lib/volunteers/admin-task-queries";
import {
  availabilityDiff,
  availabilitySummary,
  VOLUNTEER_AVAILABILITY_REASON_MAX_LENGTH,
} from "@/app/lib/volunteers/admin-tasks";
import {
  compareShiftsByStart,
  formatShiftWhenShort,
} from "@/app/lib/volunteers/format";

/**
 * "Turnos que puede": every active shift as a checkbox, marked as the
 * person can cover them today. Says what each change does, warns when a
 * removed shift is one they are assigned to (the save unassigns it), and
 * takes an optional reason. The server logs who changed it and when.
 */
export default function VolunteerAvailabilityForm({
  festivalId,
  application,
  shifts,
  adminAddedShiftIds,
  backHref,
}: {
  festivalId: number;
  application: Pick<
    VolunteerApplicationDetail,
    "id" | "fullName" | "availableShiftIds" | "assignedShiftIds" | "updatedAt"
  >;
  shifts: VolunteerTaskShift[];
  adminAddedShiftIds: number[];
  backHref: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(
    () => new Set(application.availableShiftIds),
  );
  const [reason, setReason] = useState("");
  const [isSaving, startSaving] = useTransition();

  const marked = new Set(application.availableShiftIds);
  const assigned = new Set(application.assignedShiftIds);
  const addedByAdmin = new Set(adminAddedShiftIds);
  const rows = shifts
    .filter((shift) => shift.isActive || marked.has(shift.id))
    .sort(compareShiftsByStart);
  const diff = availabilityDiff(
    application.availableShiftIds,
    [...selected],
    application.assignedShiftIds,
  );
  const changed = diff.added.length > 0 || diff.removed.length > 0;

  const toggle = (id: number, checked: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });

  const save = () =>
    startSaving(async () => {
      const result = await updateVolunteerAvailability({
        festivalId,
        applicationId: application.id,
        shiftIds: [...selected],
        reason,
        loadedUpdatedAt: application.updatedAt.toISOString(),
      });
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      router.push(backHref);
      router.refresh();
    });

  const note = (shift: VolunteerTaskShift, checked: boolean) => {
    const wasMarked = marked.has(shift.id);
    if (!wasMarked) return checked ? "Lo agregás ahora" : null;
    const origin = addedByAdmin.has(shift.id)
      ? "Lo agregó el equipo"
      : "Lo marcó al postular";
    if (!checked) return `${origin} · lo quitás ahora`;
    return assigned.has(shift.id) ? `${origin} · asignada` : origin;
  };

  return (
    <div className="mx-auto flex min-h-full w-full max-w-2xl min-w-0 flex-col">
      <div className="flex min-w-0 flex-1 flex-col gap-3 px-3 pt-2 pb-6">
        <Link
          href={backHref}
          className="inline-flex min-h-11 min-w-0 items-center gap-1 self-start font-semibold text-primary"
        >
          <ArrowLeftIcon aria-hidden="true" className="size-4 shrink-0" />
          <span className="min-w-0 break-words wrap-anywhere">
            {application.fullName}
          </span>
        </Link>

        <div>
          <h1
            className="font-display text-2xl leading-8 font-bold"
            data-installed-title=""
          >
            Turnos que puede
          </h1>
          <p className="mt-1 text-muted-foreground">
            Queda anotado quién lo cambió y cuándo.
          </p>
        </div>

        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="sr-only">Turnos que puede cubrir</legend>
          {rows.map((shift) => {
            const checked = selected.has(shift.id);
            const line = note(shift, checked);
            const losesAssignment = !checked && assigned.has(shift.id);
            return (
              <div key={shift.id} className="flex flex-col gap-1.5">
                <ChoiceRow
                  id={`availability-${shift.id}`}
                  checked={checked}
                  onCheckedChange={(value) => toggle(shift.id, value)}
                  label={`${formatShiftWhenShort(shift)}, ${shift.label}`}
                  aside={
                    checked && !marked.has(shift.id) ? (
                      <CoverageBadge shift={shift} />
                    ) : undefined
                  }
                >
                  <strong className="font-semibold">
                    {formatShiftWhenShort(shift)}
                  </strong>
                  <br />
                  {shift.label}
                  {line && (
                    <>
                      <br />
                      <span className="text-muted-foreground">{line}</span>
                    </>
                  )}
                </ChoiceRow>
                {losesAssignment && (
                  <p
                    role="status"
                    className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200"
                  >
                    <TriangleAlertIcon
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0"
                    />
                    <span className="min-w-0">
                      Está asignada a este turno. Al guardar se le quita la
                      asignación.
                    </span>
                  </p>
                )}
              </div>
            );
          })}
        </fieldset>

        <div className="grid min-w-0 gap-2">
          <Label htmlFor="availability-reason">Motivo (opcional)</Label>
          <Input
            id="availability-reason"
            placeholder="Por ejemplo: lo pidió por WhatsApp"
            maxLength={VOLUNTEER_AVAILABILITY_REASON_MAX_LENGTH}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
      </div>

      <div className="sticky bottom-0 z-10 flex flex-col gap-1.5 border-t bg-card px-3 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgb(0_0_0/0.06)] md:rounded-lg md:border">
        <span className="text-center text-muted-foreground">
          {availabilitySummary(diff)}
        </span>
        <Button
          type="button"
          size="lg"
          className="w-full"
          disabled={isSaving || !changed}
          onClick={save}
        >
          Guardar cambios
        </Button>
      </div>
    </div>
  );
}
