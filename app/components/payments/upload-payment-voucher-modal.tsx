import BaseModal from "@/app/components/modals/base-modal";
import PaymentProofUpload from "@/app/components/payments/payment-proof-upload";
import { InvoiceWithPaymentsAndStand } from "@/app/data/invoices/defiinitions";

type UploadPaymentVoucherModalProps = {
  invoice: InvoiceWithPaymentsAndStand;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};
export default function UploadPaymentVoucherModal(
  props: UploadPaymentVoucherModalProps,
) {
  return (
    <BaseModal
      title="Subir comprobante"
      show={props.open}
      onOpenChange={props.onOpenChange}
    >
      <PaymentProofUpload invoice={props.invoice} />
    </BaseModal>
  );
}
