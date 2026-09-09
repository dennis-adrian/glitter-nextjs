"use client";

import { AlertCircleIcon, ExternalLinkIcon } from "lucide-react";
import Image from "next/image";

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
import { formatStandLabel } from "@/app/lib/stands/helpers";

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
  const voucherUrl = findLatestActivePaymentProof(invoice.payments)?.voucherUrl;

  return (
    <DrawerDialog isDesktop={isDesktop} open={show} onOpenChange={onOpenChange}>
      <DrawerDialogContent isDesktop={isDesktop} className="sm:max-w-md">
        <DrawerDialogHeader isDesktop={isDesktop}>
          <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <AlertCircleIcon className="h-5 w-5" />
          </div>
          <DrawerDialogTitle isDesktop={isDesktop}>
            Confirmar reserva
          </DrawerDialogTitle>
          <DrawerDialogDescription isDesktop={isDesktop}>
            Se confirmará el espacio {standLabel}, el cobro quedará como pagado
            y se notificará por correo a las personas de la reserva.
          </DrawerDialogDescription>
        </DrawerDialogHeader>

        <div className="space-y-4 px-4 pb-6 md:px-0 md:pb-0">
          {voucherUrl && (
            <figure className="space-y-1.5">
              {/* Inline rather than a link: the comprobante is the thing being
                  judged, and sending an admin to another tab to look at it
                  loses the dialog they were deciding in. Vouchers are always
                  images — reservationPayment accepts image uploads only — so
                  next/image is safe here. */}
              <Image
                src={voucherUrl}
                alt="Comprobante de pago"
                width={640}
                height={900}
                className="mx-auto max-h-72 w-auto rounded-md border object-contain"
              />
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
