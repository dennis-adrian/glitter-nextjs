"use client";

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
import { CHECK_IN_OUTCOME_LABELS } from "@/app/lib/programs/checkin";
import { checkInTicket } from "@/app/lib/programs/checkin-actions";

type Props = {
  occurrenceId: number;
  ticketCode: string;
  attendeeName: string;
};

/**
 * The fallback for a dead phone or a lost email: an admin admits someone from
 * the roster instead of scanning them.
 *
 * Goes through the same action as the scanner, so the occurrence match, the
 * cancelled-ticket check, and the duplicate rule are the one implementation.
 * Behind a confirmation because there is no un-check-in — reversing it means a
 * database edit.
 */
export default function RosterCheckInButton({
  occurrenceId,
  ticketCode,
  attendeeName,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const res = await checkInTicket({
        occurrenceId,
        code: ticketCode,
        method: "manual_code",
      });

      if (!res.success) {
        toast.error(res.message);
        return;
      }

      if (res.result.outcome === "checked_in") {
        toast.success(`Ingreso registrado · ${attendeeName}`);
      } else {
        toast.error(CHECK_IN_OUTCOME_LABELS[res.result.outcome]);
      }

      setOpen(false);
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="text-xs"
        onClick={() => setOpen(true)}
      >
        Marcar ingreso
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Registrar el ingreso?</AlertDialogTitle>
            <AlertDialogDescription>
              Vas a marcar la llegada de {attendeeName} sin escanear su QR. Esta
              acción queda registrada a tu nombre y no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                // Radix closes on click; the transition needs the dialog to
                // stay up until the action answers.
                event.preventDefault();
                confirm();
              }}
              disabled={pending}
            >
              {pending ? "Registrando…" : "Registrar ingreso"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
