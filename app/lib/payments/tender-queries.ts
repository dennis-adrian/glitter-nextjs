import "server-only";

import { and, inArray, ne, sql } from "drizzle-orm";

import {
  attributeRepricingRefunds,
  computeInvoiceTender,
  EMPTY_TENDER,
  type InvoiceTender,
  type TenderAllocationInput,
  type TenderPaymentInput,
  type TenderSubmissionInput,
} from "@/app/lib/payments/tender";
import {
  repricingRefundsByReservation,
  type LedgerReader,
} from "@/app/lib/reservations/repricing-refund-ledger";
import { db } from "@/db";
import {
  creditLedgerEntries,
  invoiceCreditAllocations,
  invoiceSettlementSubmissions,
  invoices,
  payments,
} from "@/db/schema";

export type InvoiceTenderMap = Map<number, InvoiceTender>;

type TenderRows = {
  payments: TenderPaymentInput[];
  allocations: TenderAllocationInput[];
  submissions: TenderSubmissionInput[];
};

const NO_ROWS: TenderRows = { payments: [], allocations: [], submissions: [] };

/**
 * Coverage for a batch of invoices, read through `reader` — the client for
 * the list screens, or a transaction for the locked write paths
 * (`getInvoiceTenderTotalsInTx`). One implementation for both, so a screen
 * and the command it offers can never disagree about what a cobro is owed.
 *
 * The rows come in bulk (three queries regardless of batch size) rather than
 * per invoice, which would be an N+1 across a festival's hundreds of
 * reservations. Then the reservation's outstanding repricing refunds are
 * netted against its live cobro (`attributeRepricingRefunds`): a refund is a
 * grant into the wallet that leaves the payments and allocations standing, so
 * without this a cobro reopened after a refund showed nothing owed while the
 * repricing model said the difference was. That costs two more queries, and
 * two more only for the rare reservation with a refund and a second live
 * cobro outside the batch.
 *
 * `amount` is whatever the caller says the cobro asks for — normally the row's
 * own, but a command about to rewrite it may pass the new figure.
 */
export async function loadInvoiceTenders(
  reader: LedgerReader,
  invoiceAmounts: readonly { id: number; amount: number | string }[],
): Promise<InvoiceTenderMap> {
  const tenders: InvoiceTenderMap = new Map();
  if (invoiceAmounts.length === 0) return tenders;

  const amounts = new Map(
    invoiceAmounts.map((invoice) => [invoice.id, invoice.amount] as const),
  );
  const ids = [...amounts.keys()];

  const [rows, owners] = await Promise.all([
    readTenderRows(reader, ids),
    reader
      .select({
        id: invoices.id,
        reservationId: invoices.reservationId,
        status: invoices.status,
      })
      .from(invoices)
      .where(inArray(invoices.id, ids)),
  ]);

  // A cancelled cobro is history: whatever was refunded is netted against the
  // reservation's live one, never against it.
  const refunds = await repricingRefundsByReservation(
    reader,
    owners
      .filter((owner) => owner.status !== "cancelled")
      .map((owner) => owner.reservationId),
  );
  const refunded = [...refunds].filter(([, amount]) => amount > 0);

  const attributed = new Map<number, number>();
  if (refunded.length > 0) {
    // Every live cobro of those reservations, including any outside this
    // batch: the attribution has to come out the same whichever cobros a
    // caller happened to ask about.
    const siblings = await reader
      .select({ id: invoices.id, reservationId: invoices.reservationId })
      .from(invoices)
      .where(
        and(
          inArray(
            invoices.reservationId,
            refunded.map(([reservationId]) => reservationId),
          ),
          ne(invoices.status, "cancelled"),
        ),
      );
    const missing = siblings
      .map((sibling) => sibling.id)
      .filter((id) => !amounts.has(id));
    const extraRows =
      missing.length > 0
        ? await readTenderRows(reader, missing)
        : new Map<number, TenderRows>();

    for (const [reservationId, refundedAmount] of refunded) {
      const live = siblings
        .filter((sibling) => sibling.reservationId === reservationId)
        .map((sibling) => ({
          id: sibling.id,
          tenderedAmount: computeInvoiceTender({
            amount: 0,
            ...(rows.get(sibling.id) ?? extraRows.get(sibling.id) ?? NO_ROWS),
          }).coveredAmount,
        }));
      for (const [invoiceId, share] of attributeRepricingRefunds({
        refundedAmount,
        invoices: live,
      })) {
        attributed.set(invoiceId, share);
      }
    }
  }

  for (const id of ids) {
    tenders.set(
      id,
      computeInvoiceTender({
        amount: amounts.get(id) ?? 0,
        ...(rows.get(id) ?? NO_ROWS),
        refundedAmount: attributed.get(id) ?? 0,
      }),
    );
  }
  return tenders;
}

/**
 * Coverage for a batch of invoices on the list screens. See
 * `loadInvoiceTenders`.
 */
export async function fetchInvoiceTenders(
  invoiceIds: readonly number[],
  amountsByInvoiceId: ReadonlyMap<number, number | string>,
): Promise<InvoiceTenderMap> {
  return loadInvoiceTenders(
    db,
    [...new Set(invoiceIds)].map((id) => ({
      id,
      amount: amountsByInvoiceId.get(id) ?? 0,
    })),
  );
}

/** The tender for one invoice, or a zeroed one when it is not in the map. */
export function tenderFor(
  tenders: InvoiceTenderMap,
  invoiceId: number,
): InvoiceTender {
  return tenders.get(invoiceId) ?? EMPTY_TENDER;
}

/** Payments, allocations (with their reversal) and submissions, by invoice. */
async function readTenderRows(
  reader: LedgerReader,
  ids: readonly number[],
): Promise<Map<number, TenderRows>> {
  const [paymentRows, allocationRows, submissionRows] = await Promise.all([
    reader
      .select({
        id: payments.id,
        invoiceId: payments.invoiceId,
        amount: payments.amount,
      })
      .from(payments)
      .where(inArray(payments.invoiceId, [...ids])),
    reader
      .select({
        invoiceId: invoiceCreditAllocations.invoiceId,
        amount: invoiceCreditAllocations.amount,
        // An allocation is undone by a ledger entry pointing at its spend; the
        // row itself stays as history.
        reversed: sql<boolean>`EXISTS (
          SELECT 1
          FROM ${creditLedgerEntries} r
          WHERE r.reverses_entry_id = ${invoiceCreditAllocations.ledgerEntryId}
        )`,
      })
      .from(invoiceCreditAllocations)
      .where(inArray(invoiceCreditAllocations.invoiceId, [...ids])),
    reader
      .select({
        invoiceId: invoiceSettlementSubmissions.invoiceId,
        paymentId: invoiceSettlementSubmissions.paymentId,
        status: invoiceSettlementSubmissions.status,
        // Selected so `pendingZeroValueRequest` is answerable; the locked write
        // paths and the list screens must agree on it.
        kind: invoiceSettlementSubmissions.kind,
      })
      .from(invoiceSettlementSubmissions)
      .where(inArray(invoiceSettlementSubmissions.invoiceId, [...ids])),
  ]);

  const grouped = new Map<number, TenderRows>();
  const bucket = (invoiceId: number): TenderRows => {
    let entry = grouped.get(invoiceId);
    if (!entry) {
      entry = { payments: [], allocations: [], submissions: [] };
      grouped.set(invoiceId, entry);
    }
    return entry;
  };
  for (const row of paymentRows) {
    bucket(row.invoiceId).payments.push({ id: row.id, amount: row.amount });
  }
  for (const row of allocationRows) {
    bucket(row.invoiceId).allocations.push({
      amount: row.amount,
      reversed: Boolean(row.reversed),
    });
  }
  for (const row of submissionRows) {
    bucket(row.invoiceId).submissions.push({
      paymentId: row.paymentId,
      status: row.status,
      kind: row.kind,
    });
  }
  return grouped;
}
