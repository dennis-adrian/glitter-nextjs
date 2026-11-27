"use client";

import { PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import {
  DrawerDialog,
  DrawerDialogContent,
  DrawerDialogDescription,
  DrawerDialogHeader,
  DrawerDialogTitle,
  DrawerDialogTrigger,
} from "@/app/components/ui/drawer-dialog";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { useMediaQuery } from "@/app/hooks/use-media-query";
import {
  archiveStaffMember,
  createStaffMember,
  restoreStaffMember,
  updateStaffMember,
} from "@/app/lib/credentials/actions";
import type { CredentialStaffRow } from "@/app/lib/credentials/calculate";
import {
  CREDENTIALS_COPY,
  STAFF_NAME_MAX,
  STAFF_ROLE_MAX,
  type CredentialsResult,
} from "@/app/lib/credentials/definitions";
import { staffMemberFieldsSchema } from "@/app/lib/credentials/schema";
import { toastActionError } from "@/app/lib/errors/action-error";
import { cn } from "@/app/lib/utils";

/**
 * "Agregar persona" and "Editar" for the Glitter team roster, in a
 * DrawerDialog. The roster is shared by every edition; editing renames
 * someone everywhere. Archiving is here too.
 */
export default function StaffMemberDialog({
  festivalId,
  member,
}: {
  festivalId: number;
  /** Absent: a new person. */
  member?: CredentialStaffRow;
}) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState(member?.fullName ?? "");
  const [roleLabel, setRoleLabel] = useState(member?.roleLabel ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(call: () => Promise<CredentialsResult>) {
    startTransition(async () => {
      try {
        const result = await call();
        if (!result.success) {
          setError(result.message);
          return;
        }
        toast.success(result.message);
        setOpen(false);
        router.refresh();
      } catch (caught) {
        toastActionError(caught, CREDENTIALS_COPY.genericError);
      }
    });
  }

  function save() {
    const parsed = staffMemberFieldsSchema.safeParse({ fullName, roleLabel });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? CREDENTIALS_COPY.genericError);
      return;
    }
    setError(null);
    run(() =>
      member
        ? updateStaffMember({ festivalId, staffMemberId: member.id, ...parsed.data })
        : createStaffMember({ festivalId, ...parsed.data }),
    );
  }

  const nameId = member ? `staff-${member.id}-name` : "staff-new-name";
  const roleId = member ? `staff-${member.id}-role` : "staff-new-role";

  return (
    <DrawerDialog
      isDesktop={isDesktop}
      open={open}
      // A swipe would only half-close the sheet while a write keeps it open.
      dismissible={!isPending}
      onOpenChange={(next) => {
        // Held open while saving or archiving: the write closes the session
        // that started it.
        if (!next && isPending) return;
        setOpen(next);
        if (next) {
          setFullName(member?.fullName ?? "");
          setRoleLabel(member?.roleLabel ?? "");
          setError(null);
        }
      }}
    >
      <DrawerDialogTrigger isDesktop={isDesktop}>
        {member ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Editar a ${member.fullName}`}
          >
            Editar
          </Button>
        ) : (
          <Button type="button" variant="outline" wrap>
            <PlusIcon className="mr-2 h-4 w-4 shrink-0" aria-hidden />
            Agregar persona
          </Button>
        )}
      </DrawerDialogTrigger>
      <DrawerDialogContent isDesktop={isDesktop} className="sm:max-w-md">
        <DrawerDialogHeader isDesktop={isDesktop}>
          <DrawerDialogTitle isDesktop={isDesktop} className="text-left wrap-anywhere">
            {member ? `Editar a ${member.fullName}` : "Agregar persona al equipo"}
          </DrawerDialogTitle>
          <DrawerDialogDescription isDesktop={isDesktop} className="text-left">
            {member
              ? "El cambio vale para todas las ediciones."
              : "Queda en la lista para todas las ediciones y marcada en esta."}
          </DrawerDialogDescription>
        </DrawerDialogHeader>
        <form
          className={cn("flex flex-col gap-4", !isDesktop && "px-4 pb-4")}
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
          noValidate
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor={nameId}>Nombre en la credencial</Label>
            <Input
              id={nameId}
              value={fullName}
              maxLength={STAFF_NAME_MAX}
              autoComplete="off"
              onChange={(event) => setFullName(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={roleId}>Rol</Label>
            <Input
              id={roleId}
              value={roleLabel}
              maxLength={STAFF_ROLE_MAX}
              placeholder="Producción, Montaje…"
              autoComplete="off"
              onChange={(event) => setRoleLabel(event.target.value)}
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2">
            {member ? (
              <Button
                type="button"
                variant="ghost"
                wrap
                disabled={isPending}
                onClick={() =>
                  run(() =>
                    (member.isActive ? archiveStaffMember : restoreStaffMember)({
                      festivalId,
                      staffMemberId: member.id,
                    }),
                  )
                }
              >
                {member.isActive ? "Archivar" : "Restaurar"}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={() => setOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Guardando..." : "Guardar"}
              </Button>
            </div>
          </div>
        </form>
      </DrawerDialogContent>
    </DrawerDialog>
  );
}
