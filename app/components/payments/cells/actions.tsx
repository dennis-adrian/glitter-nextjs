"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  BadgeCheckIcon,
  CheckCheckIcon,
  CoinsIcon,
  TagIcon,
  UploadIcon,
  FilePenLineIcon,
  MoreHorizontalIcon,
  ScaleIcon,
} from "lucide-react";
import { InvoiceWithTender } from "@/app/data/invoices/definitions";
import { isActivePaymentProof } from "@/app/lib/payments/helpers";
import { useState } from "react";
import ConfirmReservationModal from "@/app/components/payments/confirm-reservation-modal";
import ApplyDiscountDialog from "@/app/components/payments/apply-discount-dialog";
import AdminPaymentProofDialog from "@/app/components/payments/admin-payment-proof-dialog";
import CorrectPaymentProofDialog from "@/app/components/payments/correct-payment-proof-dialog";
import GuardedMenuItem from "@/app/components/payments/guarded-menu-item";
import ReleaseCreditsDialog from "@/app/components/payments/release-credits-dialog";
import SettleShortfallDialog from "@/app/components/payments/settle-shortfall-dialog";

type ActionsCellProps = {
  invoice: InvoiceWithTender;
  isAdmin: boolean;
};

export default function ActionsCell(props: ActionsCellProps) {
  const [openConfirmReservationModal, setOpenConfirmReservationModal] =
    useState(false);
  const [openDiscountDialog, setOpenDiscountDialog] = useState(false);
  const [openProofDialog, setOpenProofDialog] = useState(false);
  const [openCorrectProofDialog, setOpenCorrectProofDialog] = useState(false);
  const [openReleaseCreditsDialog, setOpenReleaseCreditsDialog] =
    useState(false);
  const [openShortfallDialog, setOpenShortfallDialog] = useState(false);

  const { invoice, isAdmin } = props;
  const { tender } = invoice;
  const hasPaymentProof = invoice.payments.some(isActivePaymentProof);
  const underReview = invoice.status === "verification_payment";
  const settled = invoice.status === "paid" || invoice.status === "cancelled";

  const notAdmin = isAdmin
    ? undefined
    : "Solo un administrador global puede hacerlo";

  const discountReason =
    notAdmin ??
    (invoice.status !== "pending"
      ? "Solo se aplica a un cobro pendiente"
      : invoice.discountCodeId !== null
        ? "Este cobro ya tiene un descuento"
        : // applyDiscountCode refuses once credits are allocated; the item used
          // to stay enabled and fail every time.
          tender.confirmedCreditAmount > 0
          ? "No se puede aplicar un descuento después de usar créditos"
          : undefined);

  const uploadReason =
    notAdmin ??
    (settled
      ? "Este cobro ya está cerrado"
      : tender.outstandingAmount <= 0
        ? "El saldo ya está cubierto"
        : undefined);

  const releaseCreditsReason =
    notAdmin ??
    (tender.confirmedCreditAmount <= 0
      ? "No hay créditos aplicados que devolver"
      : settled
        ? "Este cobro ya está cerrado"
        : underReview
          ? "Resolvé el comprobante en revisión primero"
          : undefined);

  const shortfallReason =
    notAdmin ??
    (settled
      ? "Este cobro ya está cerrado"
      : tender.coveredAmount <= 0
        ? "No hay saldo cubierto para confirmar"
        : tender.outstandingAmount <= 0
          ? "No hay saldo pendiente; usá la confirmación normal"
          : undefined);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <span className="sr-only">Open menu</span>
            <MoreHorizontalIcon className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel>Cobro</DropdownMenuLabel>
          <GuardedMenuItem
            disabledReason={discountReason}
            onSelect={() => setOpenDiscountDialog(true)}
          >
            <TagIcon className="h-4 w-4 mr-1" />
            Aplicar descuento
          </GuardedMenuItem>
          {hasPaymentProof ? (
            <GuardedMenuItem
              disabledReason={notAdmin}
              destructive
              onSelect={() => setOpenCorrectProofDialog(true)}
            >
              <FilePenLineIcon className="h-4 w-4 mr-1" />
              Corregir comprobante
            </GuardedMenuItem>
          ) : (
            <GuardedMenuItem
              disabledReason={uploadReason}
              onSelect={() => setOpenProofDialog(true)}
            >
              <UploadIcon className="h-4 w-4 mr-1" />
              Subir comprobante
            </GuardedMenuItem>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuLabel>Créditos</DropdownMenuLabel>
          <GuardedMenuItem
            disabledReason={releaseCreditsReason}
            onSelect={() => setOpenReleaseCreditsDialog(true)}
          >
            <CoinsIcon className="h-4 w-4 mr-1" />
            Devolver créditos aplicados
          </GuardedMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuLabel>Reserva</DropdownMenuLabel>
          {invoice.reservation.status !== "accepted" ? (
            <GuardedMenuItem
              disabledReason={notAdmin}
              onSelect={() => setOpenConfirmReservationModal(true)}
            >
              <CheckCheckIcon className="h-4 w-4 mr-1" />
              Confirmar reserva
            </GuardedMenuItem>
          ) : (
            <GuardedMenuItem disabledReason="La reserva ya está confirmada">
              <BadgeCheckIcon className="h-4 w-4 mr-1" />
              Reserva confirmada
            </GuardedMenuItem>
          )}
          <GuardedMenuItem
            disabledReason={shortfallReason}
            onSelect={() => setOpenShortfallDialog(true)}
          >
            <ScaleIcon className="h-4 w-4 mr-1" />
            Confirmar con saldo pendiente
          </GuardedMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {isAdmin && (
        <>
          <ConfirmReservationModal
            show={openConfirmReservationModal}
            onOpenChange={setOpenConfirmReservationModal}
            invoice={invoice}
            canMarkAsPaid={isAdmin}
          />
          <ApplyDiscountDialog
            invoice={invoice}
            open={openDiscountDialog}
            onOpenChange={setOpenDiscountDialog}
          />
          <AdminPaymentProofDialog
            invoice={invoice}
            open={openProofDialog}
            onOpenChange={setOpenProofDialog}
          />
          <CorrectPaymentProofDialog
            invoice={invoice}
            open={openCorrectProofDialog}
            onOpenChange={setOpenCorrectProofDialog}
          />
          <ReleaseCreditsDialog
            invoice={invoice}
            open={openReleaseCreditsDialog}
            onOpenChange={setOpenReleaseCreditsDialog}
          />
          <SettleShortfallDialog
            invoice={invoice}
            open={openShortfallDialog}
            onOpenChange={setOpenShortfallDialog}
          />
        </>
      )}
    </>
  );
}
