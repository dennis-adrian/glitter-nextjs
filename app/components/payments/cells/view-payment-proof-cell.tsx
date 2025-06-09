import PaymentProofModal from "@/app/components/payments/payment-proof-modal";
import { PaymentBase } from "@/app/data/invoices/definitions";
import { EyeIcon } from "lucide-react";
import { useState } from "react";

type ViewPaymetnProofCellProps = {
  payment?: PaymentBase;
};
export default function ViewPaymentProofCell(props: ViewPaymetnProofCellProps) {
  const [showProofModal, setShowProofModal] = useState(false);

  return (
    <>
      <span
        className="flex items-center cursor-pointer"
        onClick={() => setShowProofModal(true)}
      >
        {props.payment?.voucherUrl ? (
          <>
            <EyeIcon className="w-4 h-4 mr-2" />
            Ver comprobante
          </>
        ) : (
          "--"
        )}
      </span>
      <PaymentProofModal
        imageUrl={props.payment?.voucherUrl}
        show={showProofModal}
        onOpenChange={setShowProofModal}
      />
    </>
  );
}
