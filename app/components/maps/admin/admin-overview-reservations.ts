import { InvoiceWithParticipants } from "@/app/data/invoices/definitions";
import { occupiesStandCapacity } from "@/app/lib/reservations/policy";

/**
 * Generic over the invoice shape so the caller's extra fields survive.
 *
 * Pinning this to `InvoiceWithParticipants` silently narrowed the map's
 * invoices on the way to the stand drawer, so the confirmation dialog — the
 * same component the reservations console uses — lost the feature credits the
 * query had already loaded.
 */
export type StandReservationSummary<
  T extends InvoiceWithParticipants = InvoiceWithParticipants,
> = {
  activeInvoice: T | null;
  cancelledInvoices: T[];
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
 * Keeps terminal reservations out of the stand's current state while retaining
 * them as history. If inconsistent data contains more than one active
 * reservation, the newest reservation wins deterministically.
 */
export function getStandReservationSummary<T extends InvoiceWithParticipants>(
  invoices: T[],
  standId: number,
): StandReservationSummary<T> {
  const standInvoices = invoices
    .filter((invoice) => invoice.reservation.standId === standId)
    .sort(newestReservationFirst);

  return {
    activeInvoice:
      standInvoices.find((invoice) =>
        occupiesStandCapacity(invoice.reservation.status),
      ) ?? null,
    cancelledInvoices: standInvoices.filter(
      (invoice) => !occupiesStandCapacity(invoice.reservation.status),
    ),
  };
}
