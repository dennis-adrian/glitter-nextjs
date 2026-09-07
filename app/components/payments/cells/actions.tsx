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
  TagIcon,
  UploadIcon,
  FilePenLineIcon,
  MoreHorizontalIcon,
} from "lucide-react";
import { InvoiceWithParticipants } from "@/app/data/invoices/definitions";
import { isActivePaymentProof } from "@/app/lib/payments/helpers";
import { useState } from "react";
import ConfirmReservationModal from "@/app/components/payments/confirm-reservation-modal";
import ApplyDiscountDialog from "@/app/components/payments/apply-discount-dialog";
import AdminPaymentProofDialog from "@/app/components/payments/admin-payment-proof-dialog";
import CorrectPaymentProofDialog from "@/app/components/payments/correct-payment-proof-dialog";

type ActionsCellProps = {
  invoice: InvoiceWithParticipants;
  isAdmin: boolean;
};

export default function ActionsCell(props: ActionsCellProps) {
  const [openConfirmReservationModal, setOpenConfirmReservationModal] =
    useState(false);
  const [openDiscountDialog, setOpenDiscountDialog] = useState(false);
  const [openProofDialog, setOpenProofDialog] = useState(false);
  const [openCorrectProofDialog, setOpenCorrectProofDialog] = useState(false);
  const hasPaymentProof = props.invoice.payments.some(isActivePaymentProof);

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
          {props.isAdmin && (
            <>
              <DropdownMenuItem
                disabled={
                  props.invoice.status !== "pending" ||
                  props.invoice.discountCodeId !== null
                }
                onSelect={() => setOpenDiscountDialog(true)}
              >
                <TagIcon className="h-4 w-4 mr-1" />
                Aplicar descuento
              </DropdownMenuItem>
              {hasPaymentProof ? (
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={() => setOpenCorrectProofDialog(true)}
                >
                  <FilePenLineIcon className="h-4 w-4 mr-1" />
                  Corregir comprobante
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onSelect={() => setOpenProofDialog(true)}>
                  <UploadIcon className="h-4 w-4 mr-1" />
                  Subir comprobante
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
            </>
          )}
          {props.invoice.reservation.status !== "accepted"
            ? props.isAdmin && (
                <DropdownMenuItem
                  onClick={() => setOpenConfirmReservationModal(true)}
                >
                  <CheckCheckIcon className="h-4 w-4 mr-1" />
                  Confirmar reserva
                </DropdownMenuItem>
              )
            : (
                <DropdownMenuItem disabled>
                  <BadgeCheckIcon className="h-4 w-4 mr-1" />
                  Reserva confirmada
                </DropdownMenuItem>
              )}
        </DropdownMenuContent>
      </DropdownMenu>
      {props.isAdmin && (
        <ConfirmReservationModal
          show={openConfirmReservationModal}
          onOpenChange={setOpenConfirmReservationModal}
          invoice={props.invoice}
          canMarkAsPaid={props.isAdmin}
        />
      )}
      {props.isAdmin && (
        <>
          <ApplyDiscountDialog
            invoice={props.invoice}
            open={openDiscountDialog}
            onOpenChange={setOpenDiscountDialog}
          />
          <AdminPaymentProofDialog
            invoice={props.invoice}
            open={openProofDialog}
            onOpenChange={setOpenProofDialog}
          />
          <CorrectPaymentProofDialog
            invoice={props.invoice}
            open={openCorrectProofDialog}
            onOpenChange={setOpenCorrectProofDialog}
          />
        </>
      )}
    </>
  );
}
