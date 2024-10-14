import { InvoiceWithPayments } from "@/app/data/invoices/defiinitions";
import { formatDate } from "@/app/lib/formatters";
import { DateTime } from "luxon";

export default function PaymentStatus({
  invoices,
}: {
  invoices: InvoiceWithPayments[];
}) {
  const invoice = invoices[0];
  if (!invoice) return "--";
  return (
    <div>
      <span>{getPaymentStatus(invoice)}</span>
    </div>
  );
}

export function getPaymentStatus(invoice: InvoiceWithPayments) {
  const paymentDateDiff = DateTime.now().diff(
    formatDate(invoice.createdAt),
    "days",
  ).days;
  const isOutstanding = paymentDateDiff > 5 && invoice.status === "pending";
  if (isOutstanding) return "Atrasado";
  switch (invoice.status) {
    case "pending":
      return "Pendiente";
    case "paid":
      return "Pagado";
    case "cancelled":
      return "Cancelado";
    default:
      return "--";
  }
}
