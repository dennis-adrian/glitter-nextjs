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
  AlertDialogTrigger,
} from "@/app/components/ui/alert-dialog";
import { Button } from "@/app/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/app/components/ui/dialog";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import {
  OCCURRENCE_REASON_MAX,
  type SessionOccurrence,
} from "@/app/lib/programs/definitions";
import { dateOrNull, toDateTimeLocal } from "@/app/lib/programs/form-schemas";
import {
  cancelOccurrence,
  completeOccurrence,
  deleteOccurrence,
  rescheduleOccurrence,
  setOccurrenceSalesClosed,
} from "@/app/lib/programs/occurrence-actions";

type Props = {
  occurrence: SessionOccurrence;
};

/** The reschedule form seeded from the occurrence as it stands right now. */
function freshReschedule(occurrence: SessionOccurrence) {
  return {
    startsAt: toDateTimeLocal(occurrence.startsAt),
    endsAt: toDateTimeLocal(occurrence.endsAt),
    reason: "",
  };
}

/**
 * Lifecycle actions for one occurrence. Cancelling and rescheduling both demand
 * a reason, because both are recorded and both are visible to ticket holders
 * once sales exist.
 */
export default function OccurrenceActionsMenu({ occurrence }: Props) {
  const [isPending, startTransition] = useTransition();
  const [cancelReason, setCancelReason] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [reschedule, setReschedule] = useState(() =>
    freshReschedule(occurrence),
  );

  /**
   * Both dialogs re-seed on open rather than trusting their initial state.
   * `useState` runs once for the life of the component, so a discarded draft —
   * or an occurrence whose schedule changed since mount — would otherwise
   * reappear on the next open, and the admin would be editing stale values.
   */
  function openReschedule(open: boolean) {
    if (open) setReschedule(freshReschedule(occurrence));
    setRescheduleOpen(open);
  }

  function openCancel(open: boolean) {
    if (open) setCancelReason("");
    setCancelOpen(open);
  }

  const isScheduled = occurrence.lifecycleStatus === "scheduled";
  const salesClosed = occurrence.salesClosedAt !== null;
  const rescheduleStartsAt = dateOrNull(reschedule.startsAt);
  const rescheduleEndsAt = dateOrNull(reschedule.endsAt);

  function run(promise: Promise<{ success: boolean; message: string }>) {
    startTransition(async () => {
      try {
        const result = await promise;
        if (result.success) {
          toast.success(result.message);
          setCancelOpen(false);
          setDeleteOpen(false);
          setCompleteOpen(false);
          setRescheduleOpen(false);
        } else {
          toast.error(result.message);
        }
      } catch (error) {
        console.error(error);
        toast.error("No se pudo completar la acción");
      }
    });
  }

  if (!isScheduled) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={() =>
          run(setOccurrenceSalesClosed(occurrence.id, !salesClosed))
        }
      >
        {salesClosed ? "Reabrir ventas" : "Cerrar ventas"}
      </Button>

      <Dialog open={rescheduleOpen} onOpenChange={openReschedule}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" disabled={isPending}>
            Reprogramar
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reprogramar horario</DialogTitle>
            <DialogDescription>
              Las entradas siguen siendo válidas. Queda registrado quién lo
              cambió y por qué.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-2">
              <Label htmlFor={`reschedule-start-${occurrence.id}`}>
                Inicio
              </Label>
              <Input
                id={`reschedule-start-${occurrence.id}`}
                type="datetime-local"
                value={reschedule.startsAt}
                onChange={(event) =>
                  setReschedule((current) => ({
                    ...current,
                    startsAt: event.target.value,
                  }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`reschedule-end-${occurrence.id}`}>Fin</Label>
              <Input
                id={`reschedule-end-${occurrence.id}`}
                type="datetime-local"
                value={reschedule.endsAt}
                onChange={(event) =>
                  setReschedule((current) => ({
                    ...current,
                    endsAt: event.target.value,
                  }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`reschedule-reason-${occurrence.id}`}>
                Motivo
              </Label>
              <Input
                id={`reschedule-reason-${occurrence.id}`}
                value={reschedule.reason}
                onChange={(event) =>
                  setReschedule((current) => ({
                    ...current,
                    reason: event.target.value,
                  }))
                }
                placeholder="Por qué se mueve"
                maxLength={OCCURRENCE_REASON_MAX}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={
                isPending ||
                !reschedule.reason.trim() ||
                !rescheduleStartsAt ||
                !rescheduleEndsAt
              }
              onClick={() => {
                if (!rescheduleStartsAt || !rescheduleEndsAt) return;
                run(
                  rescheduleOccurrence(occurrence.id, {
                    startsAt: rescheduleStartsAt,
                    endsAt: rescheduleEndsAt,
                    venueId: occurrence.venueId,
                    room: occurrence.room,
                    reason: reschedule.reason,
                  }),
                );
              }}
            >
              Reprogramar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmed like cancel and delete: completing is one-way — a completed
          occurrence can no longer be edited, rescheduled, or cancelled. */}
      <AlertDialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <AlertDialogTrigger asChild>
          <Button variant="outline" size="sm" disabled={isPending}>
            Finalizar
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Finalizar este horario?</AlertDialogTitle>
            <AlertDialogDescription>
              Queda registrado como realizado. Después no se puede editar,
              reprogramar ni cancelar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              onClick={() => run(completeOccurrence(occurrence.id))}
            >
              Finalizar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={cancelOpen} onOpenChange={openCancel}>
        <DialogTrigger asChild>
          <Button variant="destructive" size="sm" disabled={isPending}>
            Cancelar
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar horario</DialogTitle>
            <DialogDescription>
              Detiene las ventas de este horario. El motivo queda registrado.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor={`cancel-reason-${occurrence.id}`}>Motivo</Label>
            <Input
              id={`cancel-reason-${occurrence.id}`}
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              placeholder="Por qué se cancela"
              maxLength={OCCURRENCE_REASON_MAX}
            />
          </div>
          <DialogFooter>
            <Button
              variant="destructive"
              disabled={isPending || !cancelReason.trim()}
              onClick={() => run(cancelOccurrence(occurrence.id, cancelReason))}
            >
              Cancelar horario
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="sm" disabled={isPending}>
            Eliminar
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este horario?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Solo elimina horarios sin ventas
              asociadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              onClick={() => run(deleteOccurrence(occurrence.id))}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
