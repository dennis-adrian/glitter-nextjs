import { InvoiceStatus } from "@/app/data/invoices/defiinitions";

export function getInvoiceStatusLabel(status: InvoiceStatus) {
  switch (status) {
    case "pending":
      return "Pendiente";
    case "paid":
      return "Pagado";
    case "cancelled":
      return "Cancelado";
  }
}
