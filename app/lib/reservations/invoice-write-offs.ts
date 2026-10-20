import "server-only";

import { sql } from "drizzle-orm";

import { invoices, standReservationEvents } from "@/db/schema";

/**
 * Everything "Confirmar con saldo pendiente" (`settleInvoiceShortfall`) ever
 * waived on a cobro, as its own events record it: the sum of their
 * `writtenOffAmount`, for a select on `invoices`.
 *
 * The repricing commands carry a write-off by reading it back from the row
 * (`original − discount − amount`), and the row can under-read it in exactly
 * one state: a reprice whose price no longer covered the concession clamped
 * the amount to 0 and stored the shrunken figure. Bs500 cobro, Bs300 paid,
 * Bs200 waived, moved to a Bs150 stand, reads Bs150 waived on the way back up.
 * The events never shrink, so `invoiceWrittenOffAmount` trusts them there.
 *
 * A leaf module, only the schema, so the admin partner edit and the
 * full-table downgrade can read it without the service imports the repricing
 * helpers carry.
 */
export function recordedWriteOffAmount() {
  // Qualified by hand: drizzle renders a selected field's columns without
  // their table, and inside this subquery a bare "id" would be the event's.
  const invoiceId = sql`${invoices}.${sql.identifier(invoices.id.name)}`;
  const reservationId = sql`${invoices}.${sql.identifier(invoices.reservationId.name)}`;
  return sql<number>`(
    SELECT coalesce(sum((e.payload ->> 'writtenOffAmount')::numeric), 0)
    FROM ${standReservationEvents} e
    WHERE e.reservation_id = ${reservationId}
      AND e.payload ->> 'kind' = 'invoice_shortfall_written_off'
      AND e.payload ->> 'invoiceId' = ${invoiceId}::text
  )`.mapWith(Number);
}
