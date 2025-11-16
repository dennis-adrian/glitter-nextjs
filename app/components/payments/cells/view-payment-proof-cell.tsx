import PaymentProofModal from "@/app/components/payments/payment-proof-modal";
import { InvoiceWithParticipants } from "@/app/data/invoices/definitions";
import { EyeIcon } from "lucide-react";
import { useState } from "react";

type ViewPaymentProofCellProps = {
  invoice: InvoiceWithParticipants;
};
export default function ViewPaymentProofCell(props: ViewPaymentProofCellProps) {
  const [showProofModal, setShowProofModal] = useState(false);
  const payment = props.invoice.payments[0];

  return (
    <>
      <span
        className="flex items-center cursor-pointer"
        onClick={() => setShowProofModal(true)}
      >
        {payment?.voucherUrl ? (
          <>
            <EyeIcon className="w-4 h-4 mr-2" />
            Ver comprobante
          </>
        ) : (
          "--"
        )}
      </span> 
      <PaymentProofModal
        invoice={props.invoice}
        imageUrl={payment?.voucherUrl}
        show={showProofModal}
        onOpenChange={setShowProofModal}
      />
    </>
  );
}
