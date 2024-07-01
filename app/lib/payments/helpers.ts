import { UserCategory } from "@/app/api/users/definitions";
import { FestivalBase } from "@/app/data/festivals/definitions";
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

export function getPaymentQrCodeByCategory(
  festival: FestivalBase,
  category: Exclude<UserCategory, "none">,
) {
  if (category === "illustration" || category === "new_artist") {
    return festival.illustrationPaymentQrCodeUrl;
  }

  if (category === "entrepreneurship") {
    return festival.entrepreneurshipPaymentQrCodeUrl;
  }

  if (category === "gastronomy") {
    return festival.gastronomyPaymentQrCodeUrl;
  }
}
