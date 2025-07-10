import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { InvoiceBase } from "@/app/data/invoices/definitions";

type PaymentSummaryProps = {
  invoice: InvoiceBase;
};
export function PaymentSummary({ invoice }: PaymentSummaryProps) {
  return (
		<Card>
			<CardHeader>
				<CardTitle>Resumen de Pago</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="space-y-2">
					<div className="flex justify-between">
						<span className="text-muted-foreground">Subtotal</span>
						<span>Bs{invoice.amount}</span>
					</div>
					<div className="flex justify-between">
						<span className="text-muted-foreground">Descuento</span>
						<span className="text-green-600">-Bs0.00</span>
					</div>

					<Separator className="my-3" />

					<div className="flex justify-between font-medium">
						<span>Total</span>
						<span>Bs{invoice.amount}</span>
					</div>
				</div>

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
