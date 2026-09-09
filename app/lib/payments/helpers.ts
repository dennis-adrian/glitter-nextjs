import { UserCategory } from "@/app/api/users/definitions";
import { InvoiceStatus } from "@/app/data/invoices/definitions";
import { FestivalBase } from "../festivals/definitions";

export function getInvoiceStatusLabel(status: InvoiceStatus) {
  switch (status) {
    case "pending":
      return "Pendiente";
    case "verification_payment":
      return "En revisión";
    case "paid":
      return "Pagado";
    case "cancelled":
      return "Cancelado";
  }
}

export function canAcceptInvoiceProof(status: InvoiceStatus) {
  return status === "pending" || status === "verification_payment";
}

type ReservationPaymentUploadInvoice = {
  id: number;
  userId: number;
  status: InvoiceStatus;
  reservation: { status: string };
};

export function resolveReservationPaymentUpload(input: {
  invoice: ReservationPaymentUploadInvoice | null | undefined;
  profile: { id: number; role: string };
  adminPath?: boolean;
}): { ok: true; invoiceId: number } | { ok: false; message: string } {
  const { invoice, profile, adminPath = false } = input;

  if (adminPath) {
    if (profile.role !== "admin") {
      return { ok: false, message: "No autorizado" };
    }
    if (!invoice) {
      return { ok: false, message: "Cobro no encontrado" };
    }
    return { ok: true, invoiceId: invoice.id };
  }

  if (!invoice || (invoice.userId !== profile.id && profile.role !== "admin")) {
    return { ok: false, message: "Cobro no encontrado" };
  }
  if (!canAcceptInvoiceProof(invoice.status)) {
    return {
      ok: false,
      message: "Este cobro ya no admite un comprobante",
    };
  }
  if (
    invoice.reservation.status !== "pending" &&
    invoice.reservation.status !== "verification_payment"
  ) {
    return {
      ok: false,
      message: "Esta reserva ya no admite un comprobante",
    };
  }
  return { ok: true, invoiceId: invoice.id };
}

export function countOutstandingInvoices(
  invoices: Array<{ status: InvoiceStatus }>,
) {
  return invoices.filter((invoice) => invoice.status === "pending").length;
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

export function isActivePaymentProof(payment: {
  voucherUrl: string;
  fileKey?: string | null;
}) {
  return Boolean(payment.voucherUrl && payment.fileKey);
}

export function findLatestActivePaymentProof<
  T extends {
    createdAt: Date;
    voucherUrl: string;
    fileKey?: string | null;
  },
>(payments: T[]): T | undefined {
  return [...payments]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .findLast(isActivePaymentProof);
}
