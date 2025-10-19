import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  BadgeCheckIcon,
  CheckCheckIcon,
  MoreHorizontalIcon,
} from "lucide-react";
import { InvoiceWithParticipants } from "@/app/data/invoices/definitions";
import { useState } from "react";
import ConfirmReservationModal from "@/app/components/payments/confirm-reservation-modal";

type ActionsCellProps = {
  invoice: InvoiceWithParticipants;
};

export default function ActionsCell(props: ActionsCellProps) {
  const [openConfirmReservationModal, setOpenConfirmReservationModal] =
    useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <span className="sr-only">Open menu</span>
            <MoreHorizontalIcon className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Acciones</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {props.invoice.reservation.status !== "accepted" ? (
            <DropdownMenuItem
              onClick={() => setOpenConfirmReservationModal(true)}
            >
              <CheckCheckIcon className="h-4 w-4 mr-1" />
              Confirmar reserva
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem disabled>
              <BadgeCheckIcon className="h-4 w-4 mr-1" />
              Reserva confirmada
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmReservationModal
        show={openConfirmReservationModal}
        onOpenChange={setOpenConfirmReservationModal}
        invoice={props.invoice}
      />
    </>
  );
}
