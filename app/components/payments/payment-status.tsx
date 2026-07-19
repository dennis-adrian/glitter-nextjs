import { InvoiceStatus } from "@/app/data/invoices/definitions";
import { Badge } from "@/app/components/ui/badge";

const statusColors: Record<InvoiceStatus, string> = {
  pending:
    "bg-gray-500/20 border border-gray-300 text-gray-800 hover:bg-gray-500/30 hover:border-gray-300",
  paid: "bg-green-500/20 border border-green-300 text-green-800 hover:bg-green-500/30 hover:border-green-300",
  cancelled:
    "bg-red-500/20 border border-red-300 text-red-800 hover:bg-red-500/30 hover:border-red-300",
};

const statusLabels: Record<InvoiceStatus, string> = {
  pending: "Pendiente",
  paid: "Pagado",
  cancelled: "Cancelado",
};

export default function PaymentStatus({ status }: { status: InvoiceStatus }) {
  return (
    <Badge className={`${statusColors[status]} font-normal`}>
      {statusLabels[status]}
    </Badge>
  );
}
