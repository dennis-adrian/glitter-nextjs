"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import PaymentProofUpload from "@/app/components/payments/payment-proof-upload";
import { Checkbox } from "@/app/components/ui/checkbox";
import {
  DrawerDialog,
  DrawerDialogContent,
  DrawerDialogDescription,
  DrawerDialogHeader,
  DrawerDialogTitle,
} from "@/app/components/ui/drawer-dialog";
import { approveInvoiceSettlementAction } from "@/app/lib/reservations/payment-actions";
import { InvoiceWithParticipants } from "@/app/data/invoices/definitions";
import { useMediaQuery } from "@/app/hooks/use-media-query";
import { useRouter } from "next/navigation";

export default function AdminPaymentProofDialog({
  invoice,
  open,
  onOpenChange,
}: {
  invoice: InvoiceWithParticipants;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [isUploading, setIsUploading] = useState(false);
  const [markAsPaid, setMarkAsPaid] = useState(invoice.status === "paid");
  const router = useRouter();

  const isPaid = invoice.status === "paid";

  // Keep local toggle aligned with invoice.status (e.g. after voucher removal
  // flips the invoice back to pending while this dialog stays mounted).
  useEffect(() => {
    setMarkAsPaid(isPaid);
  }, [isPaid]);

  async function handleUploadComplete(
    _imageUrl: string,
    extra?: { submissionId?: number },
  ) {
    const submittedMarkAsPaid = markAsPaid;
    if (submittedMarkAsPaid) {
      if (!extra?.submissionId) {
        toast.error("No se pudo confirmar el pago. Recargá e intentá de nuevo.");
        router.refresh();
        return;
      }
      const result = await approveInvoiceSettlementAction({
        submissionId: extra.submissionId,
      });
      if (!result.success) {
        toast.error(result.message);
        router.refresh();
        return;
      }
    }

    toast.success("Comprobante guardado correctamente.");
    setMarkAsPaid(submittedMarkAsPaid);
    onOpenChange(false);
    router.refresh();
  }

  return (
    <DrawerDialog
      isDesktop={isDesktop}
      open={open}
      onOpenChange={(next) => {
        if (!isUploading) {
          if (!next) setMarkAsPaid(isPaid);
          onOpenChange(next);
        }
      }}
    >
      <DrawerDialogContent isDesktop={isDesktop} className="sm:max-w-sm">
        <DrawerDialogHeader isDesktop={isDesktop}>
          <DrawerDialogTitle isDesktop={isDesktop}>
            Subir comprobante
          </DrawerDialogTitle>
          <DrawerDialogDescription isDesktop={isDesktop}>
            Pago #{invoice.id} · {invoice.user.displayName}
          </DrawerDialogDescription>
        </DrawerDialogHeader>
        <div className="space-y-4 px-4 pb-6 md:px-0 md:pb-0">
          {invoice.payments.some((payment) => payment.voucherUrl) && (
            <p className="mb-3 text-xs text-muted-foreground">
              Al guardar un nuevo comprobante, se reemplazará el actual.
            </p>
          )}
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
            <Checkbox
              checked={markAsPaid}
              onCheckedChange={(checked) => setMarkAsPaid(checked === true)}
              disabled={isPaid || isUploading}
              className="mt-0.5"
            />
            <span className="space-y-1">
              <span className="block text-sm font-medium">
                Marcar el pago como pagado
              </span>
              <span className="block text-xs text-muted-foreground">
                {isPaid
                  ? "El pago ya figura como pagado."
                  : "También actualizará el estado del pago."}
              </span>
            </span>
          </label>
          <PaymentProofUpload
            submitLabel="Guardar comprobante"
            uploadInput={{ invoiceId: invoice.id }}
            onUploadComplete={handleUploadComplete}
            onUploading={setIsUploading}
          />
        </div>
      </DrawerDialogContent>
    </DrawerDialog>
  );
}
