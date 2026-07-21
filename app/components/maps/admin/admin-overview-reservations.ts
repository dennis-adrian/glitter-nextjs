import { InvoiceWithParticipants } from "@/app/data/invoices/definitions";

export type StandReservationSummary = {
  activeInvoice: InvoiceWithParticipants | null;
  cancelledInvoices: InvoiceWithParticipants[];
};

function newestReservationFirst(
  a: InvoiceWithParticipants,
  b: InvoiceWithParticipants,
) {
  const createdAtDifference =
    b.reservation.createdAt.getTime() - a.reservation.createdAt.getTime();

  return createdAtDifference || b.reservation.id - a.reservation.id;
}

/**
 * Keeps rejected reservations out of the stand's current state while retaining
 * them as history. If inconsistent data contains more than one active
 * reservation, the newest reservation wins deterministically.
 */
export function getStandReservationSummary(
  invoices: InvoiceWithParticipants[],
  standId: number,
): StandReservationSummary {
  const standInvoices = invoices
    .filter((invoice) => invoice.reservation.standId === standId)
    .sort(newestReservationFirst);

  return {
    activeInvoice:
      standInvoices.find(
        (invoice) => invoice.reservation.status !== "rejected",
      ) ?? null,
    cancelledInvoices: standInvoices.filter(
      (invoice) => invoice.reservation.status === "rejected",
    ),
  };
}
