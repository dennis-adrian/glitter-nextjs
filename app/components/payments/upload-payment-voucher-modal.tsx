"use client";

import BaseModal from "@/app/components/modals/base-modal";
import PaymentProofUpload from "@/app/components/payments/payment-proof-upload";
import { InvoiceWithPaymentsAndStand } from "@/app/data/invoices/definitions";
import { isActivePaymentProof } from "@/app/lib/payments/helpers";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type UploadPaymentVoucherModalProps = {
  invoice: InvoiceWithPaymentsAndStand;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};
export default function UploadPaymentVoucherModal(
  props: UploadPaymentVoucherModalProps,
) {
  const router = useRouter();
  const existingVoucherUrl = [...props.invoice.payments]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .findLast(isActivePaymentProof)?.voucherUrl;
  const [voucherUrl, setVoucherUrl] = useState<string | undefined>(
    existingVoucherUrl,
  );
  const [hasUserUploaded, setHasUserUploaded] = useState(false);
  const previousInvoiceIdRef = useRef(props.invoice.id);

  useEffect(() => {
    if (hasUserUploaded) return;
    setVoucherUrl(existingVoucherUrl);
  }, [existingVoucherUrl, hasUserUploaded]);

  useEffect(() => {
    const didInvoiceChange = previousInvoiceIdRef.current !== props.invoice.id;
    if (!props.open && !didInvoiceChange) return;
    setHasUserUploaded(false);
    setVoucherUrl(undefined);
    previousInvoiceIdRef.current = props.invoice.id;
  }, [props.open, props.invoice.id]);

  return (
    <BaseModal
      title="Comprobante de pago"
      show={props.open}
      onOpenChange={props.onOpenChange}
    >
      <div className="mt-4">
        <PaymentProofUpload
          voucherImageUrl={voucherUrl}
          uploadInput={{ invoiceId: props.invoice.id }}
          onUploadComplete={(newUrl) => {
            setHasUserUploaded(true);
            setVoucherUrl(newUrl);
            toast.success("Comprobante enviado. Tu reserva está en revisión.");
            router.push(
              `/profiles/${props.invoice.userId}/invoices/${props.invoice.id}/success`,
            );
          }}
          onUploading={() => undefined}
        />
      </div>
    </BaseModal>
  );
}
