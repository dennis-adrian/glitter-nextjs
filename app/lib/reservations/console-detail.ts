import "server-only";

import { asc, eq, inArray } from "drizzle-orm";

import { type FeatureCreditAction } from "@/app/lib/payments/feature-credits";
import { fetchReservationFeatureCredits } from "@/app/lib/payments/feature-credits-queries";
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
  /**
   * The reservation's other credit ledger. Allocations answer "what covered
   * the cobro"; these answer "what else did this reservation cost", which is
   * the only place a late partner's credits are recorded.
   */
  featureCredits: FeatureCreditAction[];
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

  // Every invoice the reservation has, not the first row the scan happened to
  // return. A reservation normally has one, but nothing in the schema says so,
  // and a cancelled invoice beside a live one is the ordinary way to end up
  // with two — picking one arbitrarily would show that reservation's history
  // as empty, or drop half of it, depending on physical row order. This is a
  // read-only history panel, so the honest answer is all of it.
  const invoiceRows = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(eq(invoices.reservationId, reservationId))
    .orderBy(asc(invoices.createdAt), asc(invoices.id));
  const invoiceIds = invoiceRows.map((row) => row.id);

  const reviewer = users;
  const [featureCredits, allocationRows, submissionRows, eventRows] =
    await Promise.all([
      // Keyed by reservation, not invoice: a feature action is charged to the
      // reservation and survives its invoice being cancelled and replaced.
      fetchReservationFeatureCredits([reservationId]),
      invoiceIds.length === 0
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
            .where(inArray(invoiceCreditAllocations.invoiceId, invoiceIds))
            // `id` breaks ties: allocations made in one transaction share a
            // createdAt, and across two invoices so can unrelated ones.
            .orderBy(
              asc(invoiceCreditAllocations.createdAt),
              asc(invoiceCreditAllocations.id),
            ),
      invoiceIds.length === 0
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
            .where(inArray(invoiceSettlementSubmissions.invoiceId, invoiceIds))
            .orderBy(
              asc(invoiceSettlementSubmissions.createdAt),
              asc(invoiceSettlementSubmissions.id),
            ),
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
        // Same tiebreaker as the two queries above, and this one needs it most:
        // `created_at` defaults to `now()`, which is transaction start time, so
        // every event a single command writes ties exactly. Settling a shortfall
        // writes two, and without `id` the panel could show the approval above
        // the status change that caused it — backwards, in a list that reads as
        // a chronology.
        .orderBy(
          asc(standReservationEvents.createdAt),
          asc(standReservationEvents.id),
        ),
    ]);

  return {
    featureCredits: featureCredits.get(reservationId) ?? [],
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
