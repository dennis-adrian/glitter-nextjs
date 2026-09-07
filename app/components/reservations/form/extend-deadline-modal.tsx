import { ReservationWithParticipantsAndUsersAndStandAndFestival } from "@/app/api/reservations/definitions";
import { ExtendDeadlineForm } from "@/app/components/reservations/form/extend-deadline-form";
import { Button } from "@/app/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { formatDate } from "@/app/lib/formatters";
import { CalendarClockIcon } from "lucide-react";
import { DateTime } from "luxon";

export function ExtendDeadlineModal({
  open,
  reservation,
  setOpen,
}: {
  open: boolean;
  reservation: ReservationWithParticipantsAndUsersAndStandAndFestival;
  setOpen: (open: boolean) => void;
}) {
  const activeTask = reservation.scheduledTasks.find(
    (t) => t.taskType === "stand_reservation" && t.completedAt === null,
  );
  const currentDueDate = activeTask?.dueDate ?? null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Extender plazo de pago</DialogTitle>
        </DialogHeader>
        <div>
          <div className="flex items-center flex-col gap-3 m-auto text-center py-3">
            <CalendarClockIcon size={48} className="text-amber-500" />
            <div className="flex flex-col gap-2">
              <p>
                Vas a darle más tiempo al participante para pagar su reserva del
                espacio{" "}
                <strong>
                  {reservation.stand.label}
                  {reservation.stand.standNumber}
                </strong>
                .
              </p>
              {currentDueDate && (
                <p className="text-sm text-muted-foreground">
                  Fecha límite actual:{" "}
                  <strong>
                    {formatDate(currentDueDate).toLocaleString(
                      DateTime.DATETIME_MED,
                    )}
                  </strong>
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                Recibirá un correo con la nueva fecha límite.
              </p>
            </div>
          </div>
          <ExtendDeadlineForm
            reservationId={reservation.id}
            currentDueDate={currentDueDate}
            onSuccess={() => setOpen(false)}
          />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button className="w-full" variant="outline">
              Cancelar
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
