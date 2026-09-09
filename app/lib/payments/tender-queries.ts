import "server-only";

import { inArray, sql } from "drizzle-orm";

import {
  computeInvoiceTender,
  EMPTY_TENDER,
  type InvoiceTender,
} from "@/app/lib/payments/tender";
import { db } from "@/db";
import {
  creditLedgerEntries,
  invoiceCreditAllocations,
  invoiceSettlementSubmissions,
  payments,
} from "@/db/schema";

export type InvoiceTenderMap = Map<number, InvoiceTender>;

/**
 * Coverage for a batch of invoices, in three queries regardless of batch size.
 *
 * The list screens need the same totals `getInvoiceTenderTotalsInTx` computes
 * per invoice under a lock. Calling that once per row would be an N+1 across a
 * festival's hundreds of reservations, so the rows are fetched in bulk and
 * handed to the same pure `computeInvoiceTender`.
 */
export async function fetchInvoiceTenders(
  invoiceIds: readonly number[],
  amountsByInvoiceId: ReadonlyMap<number, number | string>,
): Promise<InvoiceTenderMap> {
  const tenders: InvoiceTenderMap = new Map();
  if (invoiceIds.length === 0) return tenders;

  const ids = [...new Set(invoiceIds)];

  const [paymentRows, allocationRows, submissionRows] = await Promise.all([
    db
      .select({
        id: payments.id,
        invoiceId: payments.invoiceId,
        amount: payments.amount,
      })
      .from(payments)
      .where(inArray(payments.invoiceId, ids)),
    db
      .select({
        invoiceId: invoiceCreditAllocations.invoiceId,
        amount: invoiceCreditAllocations.amount,
        reversed: sql<boolean>`EXISTS (
          SELECT 1
          FROM ${creditLedgerEntries} r
          WHERE r.reverses_entry_id = ${invoiceCreditAllocations.ledgerEntryId}
        )`,
      })
      .from(invoiceCreditAllocations)
      .where(inArray(invoiceCreditAllocations.invoiceId, ids)),
    db
      .select({
        invoiceId: invoiceSettlementSubmissions.invoiceId,
        paymentId: invoiceSettlementSubmissions.paymentId,
        status: invoiceSettlementSubmissions.status,
        kind: invoiceSettlementSubmissions.kind,
      })
      .from(invoiceSettlementSubmissions)
      .where(inArray(invoiceSettlementSubmissions.invoiceId, ids)),
  ]);

  const paymentsByInvoice = groupBy(paymentRows, (row) => row.invoiceId);
  const allocationsByInvoice = groupBy(allocationRows, (row) => row.invoiceId);
  const submissionsByInvoice = groupBy(submissionRows, (row) => row.invoiceId);

  for (const invoiceId of ids) {
    tenders.set(
      invoiceId,
      computeInvoiceTender({
        amount: amountsByInvoiceId.get(invoiceId) ?? 0,
        payments: paymentsByInvoice.get(invoiceId) ?? [],
        allocations: (allocationsByInvoice.get(invoiceId) ?? []).map((row) => ({
          amount: row.amount,
          reversed: Boolean(row.reversed),
        })),
        submissions: submissionsByInvoice.get(invoiceId) ?? [],
      }),
    );
  }

  return tenders;
}

/** The tender for one invoice, or a zeroed one when it is not in the map. */
export function tenderFor(
  tenders: InvoiceTenderMap,
  invoiceId: number,
): InvoiceTender {
  return tenders.get(invoiceId) ?? EMPTY_TENDER;
}

function groupBy<T>(rows: T[], key: (row: T) => number): Map<number, T[]> {
  const grouped = new Map<number, T[]>();
  for (const row of rows) {
    const id = key(row);
    const bucket = grouped.get(id);
    if (bucket) bucket.push(row);
    else grouped.set(id, [row]);
  }
  return grouped;
}
