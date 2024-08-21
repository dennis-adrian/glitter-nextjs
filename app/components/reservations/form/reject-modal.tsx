import { ReservationWithParticipantsAndUsersAndStandAndFestival } from "@/app/api/reservations/definitions";
import { RejectReservationForm } from "@/app/components/reservations/form/reject-reservation";
import { Button } from "@/app/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { AlertCircleIcon } from "lucide-react";

export function RejectReservationModal({
  open,
  reservation,
  setOpen,
}: {
  open: boolean;
  reservation: ReservationWithParticipantsAndUsersAndStandAndFestival;
  setOpen: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="">
        <DialogHeader>
          <DialogTitle>Rechazar Reserva</DialogTitle>
        </DialogHeader>
        <div>
          <div className="flex items-center flex-col gap-3 m-auto text-center py-3">
            <AlertCircleIcon size={48} className="text-amber-500" />
            <div className="flex flex-col gap-2">
              <p>
                ¿Estás seguro que deseas rechazar la reserva para el espacio{" "}
                <strong>
                  {reservation.stand.label}
                  {reservation.stand.standNumber}?
                </strong>
              </p>
              <p>
                El espacio cambiará a <strong>Disponible</strong> y los
                participantes recibirán un correo informando que la reserva ha
                sido rechazada
              </p>
            </div>
          </div>
          <RejectReservationForm
            reservation={reservation}
            onSuccess={() => setOpen(false)}
          />
        </div>
        <DialogFooter>
          <DialogClose>
            <Button className="w-full" variant="outline">
              Cancelar
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
