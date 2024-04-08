import { InvoiceBase } from "@/app/data/invoices/defiinitions";

export default function PendingPayment({ invoice }: { invoice: InvoiceBase }) {
  return (
    <div>
      <h1>Pago Pendiente id: {invoice.id}</h1>
      Pending Payment
    </div>
  );
}
