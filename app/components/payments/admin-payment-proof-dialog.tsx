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
import { adminAttachPaymentVoucher } from "@/app/data/invoices/actions";
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

  useEffect(() => {
    setMarkAsPaid(invoice.status === "paid");
  }, [invoice.status]);

  async function handleUploadComplete(imageUrl: string) {
    const result = await adminAttachPaymentVoucher(
      invoice.id,
      imageUrl,
      markAsPaid,
    );
    if (!result.success) {
      toast.error(result.message);
      return;
    }

    toast.success(result.message);
    // Status prop is stale until refresh; keep the submitted choice, then the
    // invoice.status effect corrects after router.refresh().
    setMarkAsPaid(markAsPaid || invoice.status === "paid");
    onOpenChange(false);
    router.refresh();
  }

  return (
    <DrawerDialog
      isDesktop={isDesktop}
      open={open}
      onOpenChange={(next) => {
        if (!isUploading) {
          if (!next) setMarkAsPaid(invoice.status === "paid");
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
              disabled={invoice.status === "paid" || isUploading}
              className="mt-0.5"
            />
            <span className="space-y-1">
              <span className="block text-sm font-medium">
                Marcar el pago como pagado
              </span>
              <span className="block text-xs text-muted-foreground">
                {invoice.status === "paid"
                  ? "El pago ya figura como pagado."
                  : "También actualizará el estado del pago."}
              </span>
            </span>
          </label>
          <PaymentProofUpload
            submitLabel="Guardar comprobante"
            onUploadComplete={handleUploadComplete}
            onUploading={setIsUploading}
          />
        </div>
      </DrawerDialogContent>
    </DrawerDialog>
  );
}
