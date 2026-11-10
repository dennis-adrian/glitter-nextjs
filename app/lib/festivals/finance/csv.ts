import type { FinanceInvoiceRow } from "@/app/lib/festivals/finance/queries";
import { keptTender } from "@/app/lib/festivals/finance/summary";
import { serializeCsvRows } from "@/app/lib/orders/csv";
import { roundMoney } from "@/app/lib/reservations/money";

const RESERVATION_STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  verification_payment: "Pago por verificar",
  accepted: "Aceptada",
  rejected: "Rechazada",
  cancelled: "Cancelada",
  released: "Liberada",
};

const HEADER = [
  "Reserva",
  "Participante",
  "Espacio",
  "Estado de la reserva",
  "Precio base",
  "Código",
  "Descuento",
  "Condonación",
  "Total con descuentos",
  "Pago directo",
  "Créditos",
  "Comprobante en revisión",
  "Por cobrar",
];

/** One row per reservation cobro, amounts as plain numbers for a spreadsheet. */
export function serializeFinanceRowsCsv(rows: readonly FinanceInvoiceRow[]) {
  const body = rows.map((row) => {
    // Net of any repricing refund, like the page's totals.
    const kept = keptTender(row.tender);
    return [
      row.reservationId,
      row.participant,
      row.standLabel,
      RESERVATION_STATUS_LABELS[row.reservationStatus] ?? row.reservationStatus,
      row.originalAmount,
      row.discountCode?.code ?? "",
      row.discountAmount,
      Math.max(0, roundMoney(row.originalAmount - row.discountAmount - row.amount)),
      row.amount,
      kept.cash,
      kept.credits,
      row.tender.submittedCashAmount,
      row.status === "cancelled" ? 0 : row.tender.outstandingAmount,
    ];
  });
  return serializeCsvRows([HEADER, ...body]);
}
