"use client";

import { useState } from "react";
import { toast } from "sonner";

import PaymentProofUpload from "@/app/components/payments/payment-proof-upload";
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
  const router = useRouter();

  async function handleUploadComplete(imageUrl: string) {
    const result = await adminAttachPaymentVoucher(invoice.id, imageUrl);
    if (!result.success) {
      toast.error(result.message);
      return;
    }

    toast.success(result.message);
    onOpenChange(false);
    router.refresh();
  }

  return (
    <DrawerDialog
      isDesktop={isDesktop}
      open={open}
      onOpenChange={(next) => {
        if (!isUploading) onOpenChange(next);
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
        <div className="px-4 pb-6 md:px-0 md:pb-0">
          {invoice.payments.some((payment) => payment.voucherUrl) && (
            <p className="mb-3 text-xs text-muted-foreground">
              Al guardar un nuevo comprobante, se reemplazará el actual.
            </p>
          )}
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
