"use client";

import { useState } from "react";
import { AlertCircleIcon, ExternalLinkIcon } from "lucide-react";

import { Checkbox } from "@/app/components/ui/checkbox";
import {
  DrawerDialog,
  DrawerDialogContent,
  DrawerDialogDescription,
  DrawerDialogHeader,
  DrawerDialogTitle,
} from "@/app/components/ui/drawer-dialog";
import { ConfirmReservationForm } from "@/app/components/payments/forms/confirm-reservation-form";
import { InvoiceWithParticipants } from "@/app/data/invoices/definitions";
import { useMediaQuery } from "@/app/hooks/use-media-query";
import { formatStandLabel } from "@/app/lib/stands/helpers";

type ConfirmReservationModalProps = {
  invoice: InvoiceWithParticipants;
  show: boolean;
  onOpenChange: (open: boolean) => void;
  canMarkAsPaid?: boolean;
};

export default function ConfirmReservationModal({
  invoice,
  show,
  onOpenChange,
  canMarkAsPaid = false,
}: ConfirmReservationModalProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [markAsPaid, setMarkAsPaid] = useState(false);
  const isPending = invoice.status === "pending";
  const standLabel = formatStandLabel(invoice.reservation.stand);
  const voucherUrl = invoice.payments.find(
    (payment) => payment.voucherUrl,
  )?.voucherUrl;

  return (
    <DrawerDialog
      isDesktop={isDesktop}
      open={show}
      onOpenChange={(open) => {
        if (!open) setMarkAsPaid(false);
        onOpenChange(open);
      }}
    >
      <DrawerDialogContent isDesktop={isDesktop} className="sm:max-w-md">
        <DrawerDialogHeader isDesktop={isDesktop}>
          <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <AlertCircleIcon className="h-5 w-5" />
          </div>
          <DrawerDialogTitle isDesktop={isDesktop}>
            Confirmar reserva
          </DrawerDialogTitle>
          <DrawerDialogDescription isDesktop={isDesktop}>
            Se confirmará el espacio {standLabel} y se notificará por correo a
            las personas de la reserva.
          </DrawerDialogDescription>
        </DrawerDialogHeader>

        <div className="space-y-4 px-4 pb-6 md:px-0 md:pb-0">
          {voucherUrl && (
            <a
              href={voucherUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              Ver comprobante de pago
              <ExternalLinkIcon className="h-3.5 w-3.5" />
            </a>
          )}

          {isPending && canMarkAsPaid && (
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
              <Checkbox
                checked={markAsPaid}
                onCheckedChange={(checked) => setMarkAsPaid(checked === true)}
                className="mt-0.5"
              />
              <span className="space-y-1">
                <span className="block text-sm font-medium">
                  Marcar el pago como pagado
                </span>
                <span className="block text-xs text-muted-foreground">
                  El pago todavía figura como pendiente.
                </span>
              </span>
            </label>
          )}

          <ConfirmReservationForm
            invoice={invoice}
            markAsPaid={isPending && markAsPaid}
            onSuccess={() => {
              setMarkAsPaid(false);
              onOpenChange(false);
            }}
          />
        </div>
      </DrawerDialogContent>
    </DrawerDialog>
  );
}
