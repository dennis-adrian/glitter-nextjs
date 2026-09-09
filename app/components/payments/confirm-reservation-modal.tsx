"use client";

import { useState } from "react";
import { ExternalLinkIcon } from "lucide-react";
import Image from "next/image";

import { Skeleton } from "@/app/components/ui/skeleton";

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
  const [proofSettled, setProofSettled] = useState(false);
  const standLabel = formatStandLabel(invoice.reservation.stand);
  const voucherUrl = findLatestActivePaymentProof(invoice.payments)?.voucherUrl;

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
          {voucherUrl && (
            <figure className="space-y-1.5">
              {/* Inline rather than a link: the comprobante is the thing being
                  judged, and sending an admin to another tab to look at it
                  loses the dialog they were deciding in. Vouchers are always
                  images — reservationPayment accepts image uploads only — so
                  next/image is safe here. */}
              {/* Fixed-height frame so the dialog is the same size before and
                  after the image arrives. Sizing from the intrinsic ratio
                  instead let the width jump on load, since a comprobante is
                  whatever shape the participant's phone screenshot was. */}
              <div className="relative mx-auto h-72 w-full overflow-hidden rounded-md border bg-muted/40">
                {!proofSettled && (
                  <Skeleton className="absolute inset-0 rounded-none" />
                )}
                <Image
                  src={voucherUrl}
                  alt="Comprobante de pago"
                  fill
                  sizes="(min-width: 768px) 28rem, 90vw"
                  className="object-contain"
                  onLoad={() => setProofSettled(true)}
                  // Also on error: a failed proxy fetch would otherwise leave
                  // the skeleton pulsing forever with no way to tell it apart
                  // from a slow one. The full-size link below is the recourse.
                  onError={() => setProofSettled(true)}
                />
              </div>
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
