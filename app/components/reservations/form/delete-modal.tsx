import { ReservationWithParticipantsAndUsersAndStand } from "@/app/api/reservations/actions";
import { DeleteReservationForm } from "@/app/components/reservations/form/delete-reservation";
import { Button } from "@/app/components/ui/button";
import {
  DrawerDialog,
  DrawerDialogClose,
  DrawerDialogContent,
  DrawerDialogFooter,
  DrawerDialogHeader,
  DrawerDialogTitle,
  DrawerDialogTrigger,
} from "@/app/components/ui/drawer-dialog";
import { useMediaQuery } from "@/app/hooks/use-media-query";
import { AlertCircleIcon } from "lucide-react";

export function DeleteReservationModal({
  open,
  reservation,
  setOpen,
}: {
  open: boolean;
  reservation: ReservationWithParticipantsAndUsersAndStand;
  setOpen: (open: boolean) => void;
}) {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  return (
    <DrawerDialog isDesktop={isDesktop} open={open} onOpenChange={setOpen}>
      <DrawerDialogContent className="sm:max-w-[425px]" isDesktop={isDesktop}>
        <DrawerDialogHeader isDesktop={isDesktop}>
          <DrawerDialogTitle isDesktop={isDesktop}>
            Eliminar Reserva para Espacio {reservation.stand.label}
            {reservation.stand.standNumber}
          </DrawerDialogTitle>
        </DrawerDialogHeader>

        <div className={`${isDesktop ? "" : "px-4"}`}>
          <div className="flex items-center flex-col gap-6 m-auto text-center py-4">
            <AlertCircleIcon size={48} className="text-red-500" />
            <div className="flex flex-col gap-2">
              <p>¿Estás seguro que deseas eliminar esta reserva?</p>
              <p>
                El espacio cambiará a <strong>Disponible</strong> y los artistas
                quedarán libres para hacer otra reserva
              </p>
            </div>
          </div>
          <DeleteReservationForm
            reservation={reservation}
            onSuccess={() => setOpen(false)}
          />
        </div>
        {isDesktop ? null : (
          <DrawerDialogFooter isDesktop={isDesktop} className="pt-2">
            <DrawerDialogClose isDesktop={isDesktop}>
              <Button variant="outline">Cancelar</Button>
            </DrawerDialogClose>
          </DrawerDialogFooter>
        )}
      </DrawerDialogContent>
    </DrawerDialog>
  );
}
