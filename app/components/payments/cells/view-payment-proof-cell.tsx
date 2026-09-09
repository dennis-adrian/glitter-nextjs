import PaymentProofModal from "@/app/components/payments/payment-proof-modal";
import { findLatestActivePaymentProof } from "@/app/lib/payments/helpers";
import { EyeIcon } from "lucide-react";
import { useState } from "react";

type ViewPaymentProofCellProps = {
  invoice: {
    id: number;
    reservation: { status: string };
    payments: {
      createdAt: Date;
      voucherUrl: string;
      fileKey?: string | null;
    }[];
  };
};
export default function ViewPaymentProofCell(props: ViewPaymentProofCellProps) {
  const [showProofModal, setShowProofModal] = useState(false);
  const payment = findLatestActivePaymentProof(props.invoice.payments);

  return (
    <>
      <span
        className="flex items-center cursor-pointer"
        onClick={() => setShowProofModal(true)}
      >
        {payment ? (
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
