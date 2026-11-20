"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import VolunteerShiftForm from "@/app/components/volunteers/admin/volunteer-shift-form";
import { toastActionError } from "@/app/lib/errors/action-error";
import { cn } from "@/app/lib/utils";
import { setVolunteerShiftActive } from "@/app/lib/volunteers/admin-actions";
import {
  VOLUNTEER_ADMIN_COPY,
  type VolunteerShiftCoverage,
} from "@/app/lib/volunteers/admin-definitions";
import { formatShiftWhen } from "@/app/lib/volunteers/format";

/** Whether the shift still needs people assigned. */
export function shiftIsShort(shift: VolunteerShiftCoverage) {
  return (
    shift.neededHeadcount > 0 && shift.assignedCount < shift.neededHeadcount
  );
}

/**
 * One shift of the call with how full it is, switching in place between its
 * summary and a form.
 */
export default function VolunteerShiftRow({
  festivalId,
  shift,
}: {
  festivalId: number;
  shift: VolunteerShiftCoverage;
}) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const short = shiftIsShort(shift);

  function toggleActive() {
    startTransition(async () => {
      try {
        const result = await setVolunteerShiftActive({
          festivalId,
          id: shift.id,
          isActive: !shift.isActive,
        });
        if (!result.success) {
          toast.error(result.message);
          return;
        }
        toast.success(result.message);
        router.refresh();
      } catch (error) {
        toastActionError(error, VOLUNTEER_ADMIN_COPY.genericError);
      }
    });
  }

  return (
    <li className="min-w-0 space-y-3 rounded-lg border border-border/70 p-3">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <p className="font-medium break-words">{shift.label}</p>
          <p className="text-sm break-words text-muted-foreground">
            {formatShiftWhen(shift)}
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">
            Orden {shift.sortOrder}
          </p>
        </div>
        <Badge variant={shift.isActive ? "green" : "secondary"}>
          {shift.isActive ? "Activo" : "Inactivo"}
        </Badge>
      </div>

      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <div
          data-testid="volunteer-shift-assigned"
          data-short={short ? "" : undefined}
          className={cn(
            "flex items-baseline gap-1.5",
            short && "font-medium text-amber-700 dark:text-amber-400",
          )}
        >
          <dt>Asignados</dt>
          <dd className="tabular-nums">
            {shift.assignedCount}/{shift.neededHeadcount}
          </dd>
        </div>
        <div className="flex items-baseline gap-1.5 text-muted-foreground">
          <dt>Disponibles</dt>
          <dd className="tabular-nums">{shift.availableCount}</dd>
        </div>
      </dl>

      {isEditing ? (
        <div className="space-y-3 border-t border-border/70 pt-3">
          <VolunteerShiftForm
            festivalId={festivalId}
            shift={shift}
            onSaved={() => setIsEditing(false)}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setIsEditing(false)}
          >
            Cancelar edición
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsEditing(true)}
          >
            Editar
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={toggleActive}
          >
            {shift.isActive ? "Desactivar" : "Reactivar"}
          </Button>
        </div>
      )}
    </li>
  );
}
