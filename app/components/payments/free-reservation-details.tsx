import ConfirmFreeReservationButton from "@/app/components/payments/confirm-free-reservation-button";
import { Card, CardContent } from "@/app/components/ui/card";
import { InvoiceWithPaymentsAndStand } from "@/app/data/invoices/definitions";

type FreeReservationDetailsProps = {
  invoice: InvoiceWithPaymentsAndStand;
};

export default function FreeReservationDetails({
  invoice,
}: FreeReservationDetailsProps) {
  return (
    <div>
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center">
            <h2 className="text-xl font-semibold mb-2">Reserva sin costo</h2>
            <p className="text-center text-muted-foreground mb-4">
              Tu código de descuento cubre el costo total. Confirma tu reserva
              para continuar.
            </p>
            <ConfirmFreeReservationButton invoice={invoice} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
