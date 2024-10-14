import { Badge } from "@/app/components/ui/badge";
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

  const status = getPaymentStatus(invoice);
  const statusColors: Record<typeof status, string> = {
    Pendiente: "bg-gray-500 hover:bg-gray-400",
    Pagado: "bg-green-500 hover:bg-green-400",
    Atrasado: "bg-red-600 hover:bg-red-500",
    Cancelado: "bg-gray-500 hover:bg-gray-400",
    "--": "bg-gray-500 hover:bg-gray-400",
  };

  return <Badge className={`${statusColors[status]}`}>{status}</Badge>;
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
