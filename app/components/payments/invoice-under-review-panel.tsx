import CompletePaymentButton from "@/app/components/payments/complete-payment-button";
import { Card, CardContent } from "@/app/components/ui/card";
import { InvoiceWithPaymentsAndStand } from "@/app/data/invoices/definitions";
import { ClockIcon } from "lucide-react";

type InvoiceUnderReviewPanelProps = {
  invoice: InvoiceWithPaymentsAndStand;
  allowReplace?: boolean;
  showVoucher?: boolean;
};

export default function InvoiceUnderReviewPanel({
  invoice,
  allowReplace = true,
  showVoucher = true,
}: InvoiceUnderReviewPanelProps) {
  const voucherUrl = [...invoice.payments]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .findLast((payment) => payment.voucherUrl)?.voucherUrl;
  const isFree = Number(invoice.amount) === 0;

  return (
    <div>
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center text-center">
            <ClockIcon className="h-10 w-10 text-blue-600 mb-3" />
            <h2 className="text-xl font-semibold mb-2">Pago en revisión</h2>
            <p className="text-muted-foreground mb-4">
              {isFree
                ? "Ya solicitaste la revisión. El equipo confirma el beneficio antes de habilitar tu reserva."
                : "Ya recibimos tu comprobante. El equipo lo revisa antes de confirmar tu reserva."}
            </p>
            {showVoucher && voucherUrl && (
              <a
                href={voucherUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-primary hover:underline mb-4"
              >
                Ver el comprobante enviado
              </a>
            )}
          </div>
        </CardContent>
      </Card>
      {!isFree && allowReplace && (
        <div className="mt-4">
          <CompletePaymentButton
            invoice={invoice}
            label="Reemplazar comprobante"
          />
        </div>
      )}
    </div>
  );
}
