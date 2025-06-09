import { UserCategory } from "@/app/api/users/definitions";
import { InvoiceStatus } from "@/app/data/invoices/definitions";
import { FestivalBase } from "../festivals/definitions";

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

export function getPaymentQrCodeUrlByCategory(
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

export function getStandUrlByCategory(
  festival: FestivalBase,
  category: Exclude<UserCategory, "none">,
) {
  if (category === "illustration" || category === "new_artist") {
    return festival.illustrationStandUrl;
  }

  if (category === "gastronomy") {
    return festival.gastronomyStandUrl;
  }

  if (category === "entrepreneurship") {
    return festival.entrepreneurshipStandUrl;
  }
}
