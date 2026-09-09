"use client";

import { ExternalLinkIcon } from "lucide-react";
import VoucherViewer from "@/app/components/payments/voucher-viewer";

import {
  DrawerDialog,
  DrawerDialogContent,
  DrawerDialogDescription,
  DrawerDialogHeader,
  DrawerDialogTitle,
} from "@/app/components/ui/drawer-dialog";
import { ConfirmReservationForm } from "@/app/components/payments/forms/confirm-reservation-form";
import { InvoiceWithParticipants } from "@/app/data/invoices/definitions";
import { findLatestActivePaymentProof } from "@/app/lib/payments/helpers";
import { useMediaQuery } from "@/app/hooks/use-media-query";
import { formatDateWithTime } from "@/app/lib/formatters";
import { roundMoney } from "@/app/lib/reservations/money";
import { formatStandLabel } from "@/app/lib/stands/helpers";

function ownerName(user: InvoiceWithParticipants["user"]): string {
  return (
    user?.displayName ||
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    user?.email ||
    "—"
  );
}

type ConfirmReservationModalProps = {
  invoice: InvoiceWithParticipants;
  show: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function ConfirmReservationModal({
  invoice,
  show,
  onOpenChange,
}: ConfirmReservationModalProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const standLabel = formatStandLabel(invoice.reservation.stand);
  // The same payment whose image is shown below, so the figure and the picture
  // can never describe different uploads.
  const proof = findLatestActivePaymentProof(invoice.payments);
  const voucherUrl = proof?.voucherUrl;

  const total = roundMoney(Number(invoice.amount));
  // submitPaymentProof stamps the outstanding balance onto the payment row, so
  // this is what the comprobante was raised for — not the whole cobro, once
  // credits or an earlier payment covered part of it.
  const expected = proof ? roundMoney(Number(proof.amount)) : total;
  const alreadyCovered = roundMoney(total - expected);

  return (
    <DrawerDialog isDesktop={isDesktop} open={show} onOpenChange={onOpenChange}>
      <DrawerDialogContent isDesktop={isDesktop} className="sm:max-w-md">
        <DrawerDialogHeader isDesktop={isDesktop}>
          <DrawerDialogTitle isDesktop={isDesktop}>
            Confirmar reserva
          </DrawerDialogTitle>
          <DrawerDialogDescription isDesktop={isDesktop}>
            Se confirmará el espacio {standLabel}, el cobro quedará como pagado
            y se notificará por correo a las personas de la reserva.
          </DrawerDialogDescription>
        </DrawerDialogHeader>

        <div className="space-y-4 px-4 pb-6 md:px-0 md:pb-0">
          {/* What to check the comprobante against. The amount is the point:
              a voucher raised for the wrong figure is the common way one is
              wrong, and the figure owed is rarely the whole cobro once credits
              are involved. */}
          <dl className="space-y-1 rounded-md border bg-muted/30 p-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Titular</dt>
              <dd className="text-right font-medium">
                {ownerName(invoice.user)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Total del cobro</dt>
              <dd className="tabular-nums">Bs{total}</dd>
            </div>
            {alreadyCovered > 0 && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Ya cubierto</dt>
                <dd className="tabular-nums text-muted-foreground">
                  −Bs{alreadyCovered}
                </dd>
              </div>
            )}
            <div className="flex justify-between gap-4 border-t pt-1 font-medium">
              <dt>Monto en el comprobante</dt>
              <dd className="tabular-nums">Bs{expected}</dd>
            </div>
            {proof && (
              <div className="flex justify-between gap-4 pt-1">
                <dt className="text-muted-foreground">Enviado</dt>
                <dd className="text-right text-muted-foreground">
                  {formatDateWithTime(proof.createdAt)}
                </dd>
              </div>
            )}
          </dl>

          {voucherUrl && (
            <figure className="space-y-1.5">
              <VoucherViewer src={voucherUrl} />

              <figcaption className="text-center">
                <a
                  href={voucherUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:underline"
                >
                  Abrir en tamaño completo
                  <ExternalLinkIcon className="h-3 w-3" />
                </a>
              </figcaption>
            </figure>
          )}

          <ConfirmReservationForm
            invoice={invoice}
            onSuccess={() => onOpenChange(false)}
          />
        </div>
      </DrawerDialogContent>
    </DrawerDialog>
  );
}
