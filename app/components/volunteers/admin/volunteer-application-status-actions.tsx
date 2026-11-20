"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import { toastActionError } from "@/app/lib/errors/action-error";
import { updateVolunteerApplicationStatus } from "@/app/lib/volunteers/admin-actions";
import {
  VOLUNTEER_ADMIN_COPY,
  VOLUNTEER_APPLICATION_STATUSES,
} from "@/app/lib/volunteers/admin-definitions";
import type { VolunteerApplicationStatus } from "@/app/lib/volunteers/definitions";

/** What each button does, as a verb. */
export const VOLUNTEER_STATUS_ACTION_LABELS: Record<
  VolunteerApplicationStatus,
  string
> = {
  pending: "Volver a por revisar",
  accepted: "Aceptar",
  waitlist: "Poner en espera",
  rejected: "Rechazar",
};

const VARIANTS = {
  pending: "outline",
  accepted: "default",
  waitlist: "outline",
  rejected: "outline",
} as const satisfies Record<VolunteerApplicationStatus, string>;

/** One button per status the application can move to. */
export default function VolunteerApplicationStatusActions({
  festivalId,
  applicationId,
  status,
}: {
  festivalId: number;
  applicationId: number;
  status: VolunteerApplicationStatus;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function move(next: VolunteerApplicationStatus) {
    startTransition(async () => {
      try {
        const result = await updateVolunteerApplicationStatus({
          festivalId,
          applicationId,
          status: next,
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

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {VOLUNTEER_APPLICATION_STATUSES.filter((value) => value !== status).map(
          (value) => (
            <Button
              key={value}
              type="button"
              size="sm"
              wrap
              variant={VARIANTS[value]}
              disabled={isPending}
              onClick={() => move(value)}
            >
              {VOLUNTEER_STATUS_ACTION_LABELS[value]}
            </Button>
          ),
        )}
      </div>
      {status === "accepted" && (
        <p className="text-xs text-muted-foreground">
          Si cambiás el estado, el rol y los turnos asignados se conservan, pero
          dejan de contar en la cobertura.
        </p>
      )}
    </div>
  );
}
