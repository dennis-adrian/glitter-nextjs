import "server-only";

import { asc, eq } from "drizzle-orm";

import { canViewAdminReservationData } from "@/app/lib/reservations/policy";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { db } from "@/db";
import {
  creditLedgerEntries,
  invoiceCreditAllocations,
  invoiceSettlementSubmissions,
  invoices,
  standReservationEvents,
  users,
} from "@/db/schema";

export type ConsoleAllocation = {
  id: number;
  amount: number;
  createdAt: Date;
  reversed: boolean;
  reversedAt: Date | null;
};

export type ConsoleSubmission = {
  id: number;
  kind: string;
  status: string;
  voucherUrl: string | null;
  rejectionReason: string | null;
  reviewedAt: Date | null;
  reviewedBy: string | null;
  createdAt: Date;
};

export type ConsoleEvent = {
  id: number;
  eventType: string;
  fromStatus: string | null;
  toStatus: string | null;
  payload: unknown;
  createdAt: Date;
  actor: string | null;
};

export type ReservationConsoleDetail = {
  allocations: ConsoleAllocation[];
  submissions: ConsoleSubmission[];
  events: ConsoleEvent[];
};

/**
 * The history behind a console row.
 *
 * `stand_reservation_events` has recorded every transition with its actor since
 * the reservation hardening work, and nothing has ever displayed it — an admin
 * asking "who confirmed this, and when" had no answer inside the product.
 *
 * The submissions are the other half: `payments` is overwritten in place on
 * every re-upload, so the sequence of what was sent and what was decided only
 * survives in `invoice_settlement_submissions`.
 */
export async function fetchReservationConsoleDetail(
  reservationId: number,
): Promise<ReservationConsoleDetail | null> {
  const actor = await getCurrentUserProfile();
  if (!canViewAdminReservationData(actor)) return null;

  const invoiceRows = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(eq(invoices.reservationId, reservationId));
  const invoiceId = invoiceRows[0]?.id;

  const reviewer = users;
  const [allocationRows, submissionRows, eventRows] = await Promise.all([
    invoiceId == null
      ? Promise.resolve([])
      : db
          .select({
            id: invoiceCreditAllocations.id,
            amount: invoiceCreditAllocations.amount,
            createdAt: invoiceCreditAllocations.createdAt,
            reversedAt: creditLedgerEntries.createdAt,
          })
          .from(invoiceCreditAllocations)
          .leftJoin(
            creditLedgerEntries,
            eq(
              creditLedgerEntries.reversesEntryId,
              invoiceCreditAllocations.ledgerEntryId,
            ),
          )
          .where(eq(invoiceCreditAllocations.invoiceId, invoiceId))
          .orderBy(asc(invoiceCreditAllocations.createdAt)),
    invoiceId == null
      ? Promise.resolve([])
      : db
          .select({
            id: invoiceSettlementSubmissions.id,
            kind: invoiceSettlementSubmissions.kind,
            status: invoiceSettlementSubmissions.status,
            voucherUrl: invoiceSettlementSubmissions.voucherUrl,
            rejectionReason: invoiceSettlementSubmissions.rejectionReason,
            reviewedAt: invoiceSettlementSubmissions.reviewedAt,
            reviewerName: reviewer.displayName,
            createdAt: invoiceSettlementSubmissions.createdAt,
          })
          .from(invoiceSettlementSubmissions)
          .leftJoin(
            reviewer,
            eq(reviewer.id, invoiceSettlementSubmissions.reviewedByUserId),
          )
          .where(eq(invoiceSettlementSubmissions.invoiceId, invoiceId))
          .orderBy(asc(invoiceSettlementSubmissions.createdAt)),
    db
      .select({
        id: standReservationEvents.id,
        eventType: standReservationEvents.eventType,
        fromStatus: standReservationEvents.fromStatus,
        toStatus: standReservationEvents.toStatus,
        payload: standReservationEvents.payload,
        createdAt: standReservationEvents.createdAt,
        actorName: users.displayName,
      })
      .from(standReservationEvents)
      .leftJoin(users, eq(users.id, standReservationEvents.actorUserId))
      .where(eq(standReservationEvents.reservationId, reservationId))
      .orderBy(asc(standReservationEvents.createdAt)),
  ]);

  return {
    allocations: allocationRows.map((row) => ({
      id: row.id,
      amount: Number(row.amount),
      createdAt: row.createdAt,
      reversed: row.reversedAt != null,
      reversedAt: row.reversedAt,
    })),
    submissions: submissionRows.map((row) => ({
      id: row.id,
      kind: row.kind,
      status: row.status,
      voucherUrl: row.voucherUrl,
      rejectionReason: row.rejectionReason,
      reviewedAt: row.reviewedAt,
      reviewedBy: row.reviewerName,
      createdAt: row.createdAt,
    })),
    events: eventRows.map((row) => ({
      id: row.id,
      eventType: row.eventType,
      fromStatus: row.fromStatus,
      toStatus: row.toStatus,
      payload: row.payload,
      createdAt: row.createdAt,
      actor: row.actorName,
    })),
  };
}
