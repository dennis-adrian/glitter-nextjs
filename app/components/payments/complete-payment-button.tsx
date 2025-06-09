"use client";

import UploadPaymentVoucherModal from "@/app/components/payments/upload-payment-voucher-modal";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { InvoiceWithPaymentsAndStand } from "@/app/data/invoices/definitions";
import { UploadIcon } from "lucide-react";

type CompletePaymentButtonProps = {
  invoice: InvoiceWithPaymentsAndStand;
};
export default function CompletePaymentButton(
  props: CompletePaymentButtonProps,
) {
  const [uploadPaymentVoucher, setUploadPaymentVoucher] = useState(false);
  return (
    <>
      <Button className="w-full" onClick={() => setUploadPaymentVoucher(true)}>
        Ya hice el pago
        <UploadIcon className="ml-2 w-4 h-4" />
      </Button>
      <UploadPaymentVoucherModal
        invoice={props.invoice}
        open={uploadPaymentVoucher}
        onOpenChange={setUploadPaymentVoucher}
      />
    </>
  );
}
