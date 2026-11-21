"use client";

import { EllipsisIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
import { toastActionError } from "@/app/lib/errors/action-error";
import { updateVolunteerApplicationStatus } from "@/app/lib/volunteers/admin-actions";
import {
  VOLUNTEER_ADMIN_COPY,
  VOLUNTEER_APPLICATION_STATUSES,
  volunteerApplicationAdminPath,
} from "@/app/lib/volunteers/admin-definitions";
import type { VolunteerApplicationStatus } from "@/app/lib/volunteers/definitions";

/** The row menu's status moves, as verbs. */
export const VOLUNTEER_STATUS_MOVE_LABELS: Record<
  VolunteerApplicationStatus,
  string
> = {
  pending: "Marcar como pendiente",
  accepted: "Aceptar",
  waitlist: "Poner en espera",
  rejected: "No aceptar",
};

/**
 * A row's "more" menu: open the application, or move it to another status
 * without leaving the list. The role and shifts are assigned on the detail
 * page.
 */
export default function VolunteerApplicationRowMenu({
  festivalId,
  applicationId,
  name,
  status,
}: {
  festivalId: number;
  applicationId: number;
  name: string;
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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={isPending}
          aria-label={`Más acciones para ${name}`}
        >
          <EllipsisIcon aria-hidden="true" className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem asChild>
          <Link href={volunteerApplicationAdminPath(festivalId, applicationId)}>
            Ver postulación
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Cambiar estado
        </DropdownMenuLabel>
        {VOLUNTEER_APPLICATION_STATUSES.filter((value) => value !== status).map(
          (value) => (
            <DropdownMenuItem key={value} onSelect={() => move(value)}>
              {VOLUNTEER_STATUS_MOVE_LABELS[value]}
            </DropdownMenuItem>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
