"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import VolunteerRoleForm from "@/app/components/volunteers/admin/volunteer-role-form";
import { toastActionError } from "@/app/lib/errors/action-error";
import { setVolunteerRoleActive } from "@/app/lib/volunteers/admin-actions";
import {
  VOLUNTEER_ADMIN_COPY,
  type VolunteerAdminRole,
} from "@/app/lib/volunteers/admin-definitions";

/** One role of the call, switching in place between its summary and a form. */
export default function VolunteerRoleRow({
  festivalId,
  role,
}: {
  festivalId: number;
  role: VolunteerAdminRole;
}) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [isPending, startTransition] = useTransition();

  function toggleActive() {
    startTransition(async () => {
      try {
        const result = await setVolunteerRoleActive({
          festivalId,
          id: role.id,
          isActive: !role.isActive,
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
          <p className="font-medium break-words">{role.name}</p>
          <p className="text-sm break-words text-muted-foreground">
            {role.description}
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">
            Orden {role.sortOrder}
          </p>
        </div>
        <Badge variant={role.isActive ? "green" : "secondary"}>
          {role.isActive ? "Activo" : "Inactivo"}
        </Badge>
      </div>

      {isEditing ? (
        <div className="space-y-3 border-t border-border/70 pt-3">
          <VolunteerRoleForm
            festivalId={festivalId}
            role={role}
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
            {role.isActive ? "Desactivar" : "Reactivar"}
          </Button>
        </div>
      )}
    </li>
  );
}
