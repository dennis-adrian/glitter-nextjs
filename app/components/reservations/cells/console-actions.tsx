"use client";

import {
  CalendarClockIcon,
  CheckCheckIcon,
  CoinsIcon,
  FilePenLineIcon,
  MoreHorizontalIcon,
  ScaleIcon,
  TagIcon,
  Trash2Icon,
  UploadIcon,
  XCircleIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import type { FullReservationWithTender } from "@/app/api/reservations/definitions";
import AdminPaymentProofDialog from "@/app/components/payments/admin-payment-proof-dialog";
import ApplyDiscountDialog from "@/app/components/payments/apply-discount-dialog";
import ConfirmReservationModal from "@/app/components/payments/confirm-reservation-modal";
import CorrectPaymentProofDialog from "@/app/components/payments/correct-payment-proof-dialog";
import GuardedMenuItem from "@/app/components/payments/guarded-menu-item";
import ReleaseCreditsDialog from "@/app/components/payments/release-credits-dialog";
import SettleShortfallDialog from "@/app/components/payments/settle-shortfall-dialog";
import { DeleteReservationModal } from "@/app/components/reservations/form/delete-modal";
import { ExtendDeadlineModal } from "@/app/components/reservations/form/extend-deadline-modal";
import { RejectReservationModal } from "@/app/components/reservations/form/reject-modal";
import { Button } from "@/app/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EMPTY_TENDER } from "@/app/lib/payments/tender";
import { isActivePaymentProof } from "@/app/lib/payments/helpers";

/**
 * Every action an admin can take on a reservation and its cobro, in one menu.
 *
 * The two previous menus each covered half the object: one could cancel and
 * extend but not approve, the other could approve and discount but not cancel.
 * Nothing is hidden here — an action that cannot run right now stays visible
 * with the reason attached, so the menu teaches the state machine instead of
 * silently shrinking.
 */
export function ConsoleActionsCell({
  reservation,
  canMutate = false,
}: {
  reservation: FullReservationWithTender;
  canMutate?: boolean;
}) {
  const [openDelete, setOpenDelete] = useState(false);
  const [openReject, setOpenReject] = useState(false);
  const [openExtend, setOpenExtend] = useState(false);
  const [openConfirm, setOpenConfirm] = useState(false);
  const [openDiscount, setOpenDiscount] = useState(false);
  const [openProof, setOpenProof] = useState(false);
  const [openCorrectProof, setOpenCorrectProof] = useState(false);
  const [openReleaseCredits, setOpenReleaseCredits] = useState(false);
  const [openShortfall, setOpenShortfall] = useState(false);

  const invoice = reservation.invoices[0];
  const tender = reservation.tender ?? EMPTY_TENDER;
  const hasProof = invoice?.payments.some(isActivePaymentProof) ?? false;
  const settled = invoice?.status === "paid" || invoice?.status === "cancelled";
  const underReview = invoice?.status === "verification_payment";

  const notAdmin = canMutate
    ? undefined
    : "Solo un administrador global puede hacerlo";
  const noInvoice = invoice ? undefined : "Esta reserva no tiene cobro";

  // The invoice-rooted dialogs still expect the invoice to carry its
  // reservation; this row has them the other way around.
  const invoiceWithReservation = invoice
    ? { ...invoice, reservation, tender }
    : null;

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <span className="sr-only">Acciones</span>
            <MoreHorizontalIcon className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel>Reserva</DropdownMenuLabel>
          <GuardedMenuItem>
            <Link
              href={`/dashboard/reservations/${reservation.id}/edit`}
              className="flex items-center"
            >
              <FilePenLineIcon className="h-4 w-4 mr-1" />
              Editar
            </Link>
          </GuardedMenuItem>
          <GuardedMenuItem
            disabledReason={
              notAdmin ??
              (reservation.status === "pending"
                ? undefined
                : "Solo se extienden reservas pendientes de pago")
            }
            onSelect={() => setOpenExtend(true)}
          >
            <CalendarClockIcon className="h-4 w-4 mr-1" />
            Extender plazo de pago
          </GuardedMenuItem>
          <GuardedMenuItem
            disabledReason={
              notAdmin ??
              noInvoice ??
              (reservation.status === "accepted"
                ? "La reserva ya está confirmada"
                : undefined)
            }
            onSelect={() => setOpenConfirm(true)}
          >
            <CheckCheckIcon className="h-4 w-4 mr-1" />
            Confirmar reserva
          </GuardedMenuItem>
          <GuardedMenuItem
            disabledReason={
              notAdmin ??
              noInvoice ??
              (settled
                ? "Este cobro ya está cerrado"
                : tender.coveredAmount <= 0
                  ? "No hay saldo cubierto para confirmar"
                  : tender.outstandingAmount <= 0
                    ? "No hay saldo pendiente; usá la confirmación normal"
                    : undefined)
            }
            onSelect={() => setOpenShortfall(true)}
          >
            <ScaleIcon className="h-4 w-4 mr-1" />
            Confirmar con saldo pendiente
          </GuardedMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuLabel>Cobro</DropdownMenuLabel>
          <GuardedMenuItem
            disabledReason={
              notAdmin ??
              noInvoice ??
              (invoice?.status !== "pending"
                ? "Solo se aplica a un cobro pendiente"
                : invoice.discountCodeId !== null
                  ? "Este cobro ya tiene un descuento"
                  : tender.confirmedCreditAmount > 0
                    ? "No se puede aplicar un descuento después de usar créditos"
                    : undefined)
            }
            onSelect={() => setOpenDiscount(true)}
          >
            <TagIcon className="h-4 w-4 mr-1" />
            Aplicar descuento
          </GuardedMenuItem>
          {hasProof ? (
            <GuardedMenuItem
              disabledReason={notAdmin ?? noInvoice}
              destructive
              onSelect={() => setOpenCorrectProof(true)}
            >
              <FilePenLineIcon className="h-4 w-4 mr-1" />
              Corregir comprobante
            </GuardedMenuItem>
          ) : (
            <GuardedMenuItem
              disabledReason={
                notAdmin ??
                noInvoice ??
                (settled
                  ? "Este cobro ya está cerrado"
                  : tender.outstandingAmount <= 0
                    ? "El saldo ya está cubierto"
                    : undefined)
              }
              onSelect={() => setOpenProof(true)}
            >
              <UploadIcon className="h-4 w-4 mr-1" />
              Subir comprobante
            </GuardedMenuItem>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuLabel>Créditos</DropdownMenuLabel>
          <GuardedMenuItem
            disabledReason={
              notAdmin ??
              noInvoice ??
              (tender.confirmedCreditAmount <= 0
                ? "No hay créditos aplicados que devolver"
                : settled
                  ? "Este cobro ya está cerrado"
                  : underReview
                    ? "Resolvé el comprobante en revisión primero"
                    : undefined)
            }
            onSelect={() => setOpenReleaseCredits(true)}
          >
            <CoinsIcon className="h-4 w-4 mr-1" />
            Devolver créditos aplicados
          </GuardedMenuItem>
          <GuardedMenuItem disabledReason={noInvoice}>
            <Link
              href={`/dashboard/users/${invoice?.userId ?? ""}`}
              className="flex items-center"
            >
              <CoinsIcon className="h-4 w-4 mr-1" />
              Ver cuenta de créditos
            </Link>
          </GuardedMenuItem>

          <DropdownMenuSeparator />
          <GuardedMenuItem
            disabledReason={notAdmin}
            onSelect={() => setOpenReject(true)}
          >
            <XCircleIcon className="h-4 w-4 mr-1" />
            Cancelar reserva
          </GuardedMenuItem>
          <GuardedMenuItem
            disabledReason={notAdmin}
            destructive
            onSelect={() => setOpenDelete(true)}
          >
            <Trash2Icon className="h-4 w-4 mr-1" />
            Eliminar
          </GuardedMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DeleteReservationModal
        open={openDelete}
        reservation={reservation}
        setOpen={setOpenDelete}
      />
      <RejectReservationModal
        open={openReject}
        reservation={reservation}
        setOpen={setOpenReject}
      />
      <ExtendDeadlineModal
        open={openExtend}
        reservation={reservation}
        setOpen={setOpenExtend}
      />

      {canMutate && invoiceWithReservation && (
        <>
          <ConfirmReservationModal
            show={openConfirm}
            onOpenChange={setOpenConfirm}
            invoice={invoiceWithReservation}
            canMarkAsPaid
          />
          <ApplyDiscountDialog
            invoice={invoiceWithReservation}
            open={openDiscount}
            onOpenChange={setOpenDiscount}
          />
          <AdminPaymentProofDialog
            invoice={invoiceWithReservation}
            open={openProof}
            onOpenChange={setOpenProof}
          />
          <CorrectPaymentProofDialog
            invoice={invoiceWithReservation}
            open={openCorrectProof}
            onOpenChange={setOpenCorrectProof}
          />
          <ReleaseCreditsDialog
            invoice={invoiceWithReservation}
            open={openReleaseCredits}
            onOpenChange={setOpenReleaseCredits}
          />
          <SettleShortfallDialog
            invoice={invoiceWithReservation}
            open={openShortfall}
            onOpenChange={setOpenShortfall}
          />
        </>
      )}
    </>
  );
}
