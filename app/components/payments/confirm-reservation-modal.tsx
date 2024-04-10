import { ConfirmReservationForm } from "@/app/components/payments/forms/confirm-reservation-form";
import { Button } from "@/app/components/ui/button";
import { InvoiceWithPaymentsAndStandAndProfile } from "@/app/data/invoices/defiinitions";
import { useMediaQuery } from "@/app/hooks/use-media-query";
import {
  DrawerDialog,
  DrawerDialogClose,
  DrawerDialogContent,
  DrawerDialogFooter,
  DrawerDialogHeader,
  DrawerDialogTitle,
} from "@/components/ui/drawer-dialog";
import { AlertCircleIcon } from "lucide-react";

type ConfirmReservationModalProps = {
  invoice: InvoiceWithPaymentsAndStandAndProfile;
  show: boolean;
  onOpenChange: (open: boolean) => void;
};
export default function ConfirmReservationModal(
  props: ConfirmReservationModalProps,
) {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  return (
    <DrawerDialog
      isDesktop={isDesktop}
      open={props.show}
      onOpenChange={props.onOpenChange}
    >
      <DrawerDialogContent isDesktop={isDesktop}>
        <DrawerDialogHeader isDesktop={isDesktop}>
          <DrawerDialogTitle isDesktop={isDesktop}>
            Confirmar Reserva
          </DrawerDialogTitle>
        </DrawerDialogHeader>
        <div className={`${isDesktop ? "" : "px-4"} py-4`}>
          <div className="flex items-center flex-col gap-6 m-auto text-center py-4">
            <AlertCircleIcon size={48} className="text-amber-500" />
            <div className="flex flex-col gap-2">
              <p>
                ¿Estás seguro que deseas confirmar la reserva para el espacio{" "}
                <strong>{`${props.invoice.reservation.stand.label}${props.invoice.reservation.stand.standNumber}`}</strong>
                ?
              </p>
              <p>
                El usuario que hizo la reserva recibirá una notificación por
                correo electrónico
              </p>
            </div>
            <ConfirmReservationForm
              reservationId={props.invoice.reservation.id}
              userEmail={props.invoice.user.email}
              onSuccess={() => props.onOpenChange(false)}
            />
          </div>
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
