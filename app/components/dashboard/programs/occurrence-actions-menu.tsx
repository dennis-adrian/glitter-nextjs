"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

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
import { toDateTimeLocal } from "@/app/lib/programs/form-schemas";
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

/**
 * Lifecycle actions for one occurrence. Cancelling and rescheduling both demand
 * a reason, because both are recorded and both are visible to ticket holders
 * once sales exist.
 */
export default function OccurrenceActionsMenu({ occurrence }: Props) {
  const [isPending, startTransition] = useTransition();
  const [cancelReason, setCancelReason] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [reschedule, setReschedule] = useState({
    startsAt: toDateTimeLocal(occurrence.startsAt),
    endsAt: toDateTimeLocal(occurrence.endsAt),
    reason: "",
  });

  const isScheduled = occurrence.lifecycleStatus === "scheduled";
  const salesClosed = occurrence.salesClosedAt !== null;

  function run(promise: Promise<{ success: boolean; message: string }>) {
    startTransition(async () => {
      try {
        const result = await promise;
        if (result.success) {
          toast.success(result.message);
          setCancelOpen(false);
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

      <Dialog open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
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
              disabled={isPending || !reschedule.reason.trim()}
              onClick={() =>
                run(
                  rescheduleOccurrence(occurrence.id, {
                    startsAt: new Date(reschedule.startsAt),
                    endsAt: new Date(reschedule.endsAt),
                    venueId: occurrence.venueId,
                    room: occurrence.room,
                    reason: reschedule.reason,
                  }),
                )
              }
            >
              Reprogramar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Button
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={() => run(completeOccurrence(occurrence.id))}
      >
        Finalizar
      </Button>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
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

      <Button
        variant="ghost"
        size="sm"
        disabled={isPending}
        onClick={() => run(deleteOccurrence(occurrence.id))}
      >
        Eliminar
      </Button>
    </div>
  );
}
