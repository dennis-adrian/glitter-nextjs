import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Separator } from "@/app/components/ui/separator";
import { InvoiceBase } from "@/app/data/invoices/definitions";
import DiscountCodeInput from "./discount-code-input";

type PaymentSummaryProps = {
  invoice: InvoiceBase;
  festivalId: number;
  approvedCashAmount?: number;
  creditAppliedAmount?: number;
  outstandingAmount?: number;
};

export function PaymentSummary({
  invoice,
  festivalId,
  approvedCashAmount = 0,
  creditAppliedAmount = 0,
  outstandingAmount = invoice.amount,
}: PaymentSummaryProps) {
  const hasDiscount =
    invoice.discountCodeId !== null && invoice.discountAmount > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Resumen de Pago</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span>Bs{invoice.originalAmount}</span>
          </div>
          {hasDiscount && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Descuento</span>
              <span className="text-green-600">
                -Bs{invoice.discountAmount}
              </span>
            </div>
          )}
          {approvedCashAmount > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Pagos aprobados</span>
              <span className="text-green-600">-Bs{approvedCashAmount}</span>
            </div>
          )}
          {creditAppliedAmount > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Créditos aplicados</span>
              <span className="text-green-600">-Bs{creditAppliedAmount}</span>
            </div>
          )}

          <Separator className="my-3" />

          <div className="flex justify-between font-medium">
            <span>
              {approvedCashAmount > 0 || creditAppliedAmount > 0
                ? "Saldo pendiente"
                : "Total"}
            </span>
            <span>Bs{outstandingAmount}</span>
          </div>
        </div>

        {!hasDiscount &&
          creditAppliedAmount <= 0 &&
          invoice.status === "pending" && (
            <div className="mt-4">
              <DiscountCodeInput
                invoiceId={invoice.id}
                festivalId={festivalId}
              />
            </div>
          )}

        {(invoice.status === "pending" ||
          invoice.status === "verification_payment") && (
          <div className="mt-4 p-3 bg-muted rounded-md text-sm">
            {invoice.status === "verification_payment" ? (
              <>
                <p className="font-medium mb-1">El pago está en revisión</p>
                <p className="text-muted-foreground">
                  Recibimos tu comprobante. Puede tomar hasta 48 horas confirmar
                  la reserva.
                </p>
              </>
            ) : (
              <>
                <p className="font-medium mb-1">
                  El pago confirmará la reserva
                </p>
                <p className="text-muted-foreground">
                  Una vez realizado el pago, puede tomar hasta 48 horas para que
                  se actualice el estado de la reserva.
                </p>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
