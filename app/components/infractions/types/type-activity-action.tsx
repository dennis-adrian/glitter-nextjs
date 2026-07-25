"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/app/components/ui/alert-dialog";
import { Button } from "@/app/components/ui/button";
import { changeInfractionTypeActivity } from "@/app/lib/infraction-types/actions";
import type { InfractionType } from "@/app/lib/infractions/definitions";

export default function InfractionTypeActivityAction({
  type,
}: {
  type: InfractionType;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const nextActive = !type.active;

  const submit = () => {
    startTransition(async () => {
      const result = await changeInfractionTypeActivity({
        id: type.id,
        active: nextActive,
      });
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant={type.active ? "outline" : "secondary"}
        >
          {type.active ? "Archivar" : "Reactivar"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {type.active
              ? `¿Archivar “${type.label}”?`
              : `¿Reactivar “${type.label}”?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {type.active
              ? "Ya no podrá seleccionarse al registrar nuevas infracciones. Las infracciones históricas conservarán este tipo."
              : "El tipo volverá a estar disponible al registrar nuevas infracciones."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction disabled={isPending} onClick={submit}>
            {isPending
              ? "Guardando..."
              : type.active
                ? "Archivar"
                : "Reactivar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
