import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Separator } from "@/app/components/ui/separator";
import { InvoiceBase } from "@/app/data/invoices/definitions";
import DiscountCodeInput from "./discount-code-input";

type PaymentSummaryProps = {
  invoice: InvoiceBase;
  festivalId: number;
};

export function PaymentSummary({ invoice, festivalId }: PaymentSummaryProps) {
  const hasDiscount = invoice.discountCodeId !== null && invoice.discountAmount > 0;

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
              <span className="text-green-600">-Bs{invoice.discountAmount}</span>
            </div>
          )}

          <Separator className="my-3" />

          <div className="flex justify-between font-medium">
            <span>Total</span>
            <span>Bs{invoice.amount}</span>
          </div>
        </div>

        {!hasDiscount && (
          <div className="mt-4">
            <DiscountCodeInput invoiceId={invoice.id} festivalId={festivalId} />
          </div>
        )}

        <div className="mt-4 p-3 bg-muted rounded-md text-sm">
          <p className="font-medium mb-1">El pago confirmará la reserva</p>
          <p className="text-muted-foreground">
            Una vez realizado el pago, puede tomar hasta 48 horas para que se
            actualice el estado de la reserva.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
