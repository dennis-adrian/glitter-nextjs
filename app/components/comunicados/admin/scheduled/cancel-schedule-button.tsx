"use client";

import { CalendarXIcon } from "lucide-react";
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
} from "@/app/components/ui/alert-dialog";
import { Button } from "@/app/components/ui/button";
import { cancelComunicadoScheduleAction } from "@/app/lib/comunicados/schedule-actions";

/**
 * "Cancelar programación" (docs/IMPLEMENTATION-comunicados.md E1, G6): the
 * stop for a schedule, so it works in development too. It goes back to a
 * draft, and the page refreshes into the composer; one that started sending
 * meanwhile is refused, and refreshes into its report.
 */
export default function CancelScheduleButton({
  comunicadoId,
}: {
  comunicadoId: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function cancelSchedule() {
    startTransition(async () => {
      try {
        const result = await cancelComunicadoScheduleAction({ comunicadoId });
        if (result.success) toast.success(result.message);
        else toast.error(result.message);
        setOpen(false);
        router.refresh();
      } catch (error) {
        console.error("Error cancelling a comunicado's schedule", error);
        toast.error("No pudimos cancelar la programación. Probá de nuevo.");
      }
    });
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <CalendarXIcon className="mr-2 h-4 w-4" aria-hidden />
        Cancelar programación
      </Button>
      <AlertDialog
        open={open}
        onOpenChange={(next) => !isPending && setOpen(next)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cancelar la programación?</AlertDialogTitle>
            <AlertDialogDescription>
              Vuelve a ser un borrador y no se envía. Podés programarlo de
              nuevo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Volver</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              onClick={(event) => {
                // Stays open, and busy, until the answer comes back.
                event.preventDefault();
                cancelSchedule();
              }}
            >
              {isPending ? "Cancelando…" : "Cancelar programación"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
