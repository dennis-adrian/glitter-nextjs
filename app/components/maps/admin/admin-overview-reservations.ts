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
 * Whether a reservation actually occupies this stand.
 *
 * `reservation.standId` is only the originally selected half, so matching on it
 * left the second stand of every full table looking empty on the admin map —
 * no colour, no tooltip, no drawer — while the reservation that held it sat one
 * square over. `members` is what is occupied, and a released member is not.
 *
 * Falls back to the root when a reservation carries no member rows. Every row
 * has them today, but the fallback keeps a reservation from vanishing off the
 * map entirely if one ever does not.
 */
function occupiesStand(
  invoice: InvoiceWithParticipants,
  standId: number,
): boolean {
  const members = invoice.reservation.members;
  if (!members || members.length === 0) {
    return invoice.reservation.standId === standId;
  }
  return members.some(
    (member) => member.standId === standId && !member.releasedAt,
  );
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
    .filter((invoice) => occupiesStand(invoice, standId))
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
