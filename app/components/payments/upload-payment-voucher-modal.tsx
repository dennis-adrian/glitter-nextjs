"use client";

import BaseModal from "@/app/components/modals/base-modal";
import UploadPaymentVoucherForm from "@/app/components/payments/forms/upload-payment-voucher-form";
import PaymentProofUpload from "@/app/components/payments/payment-proof-upload";
import { InvoiceWithPaymentsAndStand } from "@/app/data/invoices/defiinitions";
import { useState } from "react";

type UploadPaymentVoucherModalProps = {
  invoice: InvoiceWithPaymentsAndStand;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};
export default function UploadPaymentVoucherModal(
  props: UploadPaymentVoucherModalProps,
) {
  const payments = props.invoice.payments;
  const [voucherUrl, setVoucherUrl] = useState<string | undefined>(
    payments[payments?.length - 1]?.voucherUrl,
  );

  return (
    <BaseModal
      title="Subir comprobante"
      show={props.open}
      onOpenChange={props.onOpenChange}
    >
      <div className="mt-4">
        <PaymentProofUpload
          voucherImageUrl={voucherUrl}
          onUploadComplete={setVoucherUrl}
        />
        <UploadPaymentVoucherForm
          invoice={props.invoice}
          newVoucherUrl={voucherUrl}
        />
      </div>
    </BaseModal>
  );
}
