import "server-only";

import { and, eq, inArray, ne, notExists, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

import {
  attributeCreditSpends,
  type AttributionTopUp,
} from "@/app/lib/festivals/finance/credit-attribution";
import {
  creditWindowStart,
  DEFAULT_CREDIT_LEAD_DAYS,
  summarizeFestivalFinance,
  type FestivalFinanceSummary,
  type FinanceInvoice,
} from "@/app/lib/festivals/finance/summary";
import { fetchInvoiceTenders, tenderFor } from "@/app/lib/payments/tender-queries";
import { db } from "@/db";
import {
  creditLedgerEntries,
  creditTopUps,
  discountCodes,
  festivals,
  financeFestivalSettings,
  invoiceCreditAllocations,
  invoices,
  reservationFeatureActions,
  standReservations,
  stands,
  users,
} from "@/db/schema";

const LIVE_STATUSES = ["pending", "verification_payment", "accepted"] as const;

/** Credit spends reversed by a later entry: refunded, so never revenue. */
const reversedSpend = (entryId: AnyPgColumn) => sql<boolean>`EXISTS (
  SELECT 1 FROM ${creditLedgerEntries} r WHERE r.reverses_entry_id = ${entryId}
)`;

export type FinanceInvoiceRow = FinanceInvoice & {
  participant: string;
  standLabel: string;
};

export type FestivalFinance = {
  festival: { id: number; name: string; reservationsStartDate: Date };
  leadDays: number;
  /** Whether an admin chose the lead days, rather than the default. */
  leadDaysCustom: boolean;
  windowStart: Date;
  summary: FestivalFinanceSummary;
  rows: FinanceInvoiceRow[];
};

export async function fetchCreditLeadDays(festivalId: number) {
  const [row] = await db
    .select({ days: financeFestivalSettings.creditLeadDays })
    .from(financeFestivalSettings)
    .where(eq(financeFestivalSettings.festivalId, festivalId))
    .limit(1);
  return row?.days ?? null;
}

async function loadInvoices(festivalId: number) {
  const rows = await db
    .select({
      id: invoices.id,
      reservationId: invoices.reservationId,
      reservationStatus: standReservations.status,
      status: invoices.status,
      originalAmount: invoices.originalAmount,
      discountAmount: invoices.discountAmount,
      amount: invoices.amount,
      dueAt: invoices.dueAt,
      code: discountCodes.code,
      codeUnit: discountCodes.discountUnit,
      codeValue: discountCodes.discountValue,
      displayName: users.displayName,
      firstName: users.firstName,
      lastName: users.lastName,
      standLabel: stands.label,
      standNumber: stands.standNumber,
    })
    .from(invoices)
    .innerJoin(standReservations, eq(standReservations.id, invoices.reservationId))
    .innerJoin(users, eq(users.id, invoices.userId))
    .innerJoin(stands, eq(stands.id, standReservations.standId))
    .leftJoin(discountCodes, eq(discountCodes.id, invoices.discountCodeId))
    .where(eq(standReservations.festivalId, festivalId))
    .orderBy(invoices.id);

  const ids = rows.map((row) => row.id);
  const [tenders, allocations] = await Promise.all([
    fetchInvoiceTenders(ids, new Map(rows.map((row) => [row.id, row.amount]))),
    ids.length === 0
      ? Promise.resolve([])
      : db
          .select({
            invoiceId: invoiceCreditAllocations.invoiceId,
            ledgerEntryId: invoiceCreditAllocations.ledgerEntryId,
            reversed: reversedSpend(invoiceCreditAllocations.ledgerEntryId),
          })
          .from(invoiceCreditAllocations)
          .where(inArray(invoiceCreditAllocations.invoiceId, ids)),
  ]);

  const spendsByInvoice = new Map<number, number[]>();
  for (const allocation of allocations) {
    if (allocation.reversed) continue;
    const list = spendsByInvoice.get(allocation.invoiceId) ?? [];
    list.push(allocation.ledgerEntryId);
    spendsByInvoice.set(allocation.invoiceId, list);
  }

  return rows.map(
    (row): FinanceInvoiceRow => ({
      id: row.id,
      reservationId: row.reservationId,
      reservationStatus: row.reservationStatus,
      status: row.status,
      originalAmount: row.originalAmount,
      discountAmount: row.discountAmount,
      amount: row.amount,
      dueAt: row.dueAt,
      discountCode:
        row.code != null && row.codeUnit != null && row.codeValue != null
          ? { code: row.code, unit: row.codeUnit, value: row.codeValue }
          : null,
      tender: tenderFor(tenders, row.id),
      creditSpendIds: spendsByInvoice.get(row.id) ?? [],
      participant:
        row.displayName ||
        [row.firstName, row.lastName].filter(Boolean).join(" ") ||
        "Sin nombre",
      standLabel: row.standLabel || String(row.standNumber),
    }),
  );
}

async function loadFeatureSpends(festivalId: number) {
  const rows = await db
    .select({
      ledgerEntryId: creditLedgerEntries.id,
      type: reservationFeatureActions.type,
      amount: creditLedgerEntries.amount,
      userId: creditLedgerEntries.userId,
      reversed: reversedSpend(creditLedgerEntries.id),
    })
    .from(reservationFeatureActions)
    .innerJoin(
      creditLedgerEntries,
      and(
        eq(creditLedgerEntries.featureActionId, reservationFeatureActions.id),
        eq(creditLedgerEntries.type, "spend"),
      ),
    )
    .where(eq(reservationFeatureActions.festivalId, festivalId));
  return rows
    .filter((row) => !row.reversed)
    .map((row) => ({
      ledgerEntryId: row.ledgerEntryId,
      type: row.type,
      amount: -row.amount,
      userId: row.userId,
    }));
}

/** Live reservations with no live invoice: spaces given away. */
async function loadFreeReservations(festivalId: number) {
  const rows = await db
    .select({
      reservationId: standReservations.id,
      value: standReservations.priceAmountSnapshot,
    })
    .from(standReservations)
    .where(
      and(
        eq(standReservations.festivalId, festivalId),
        inArray(standReservations.status, [...LIVE_STATUSES]),
        notExists(
          db
            .select({ id: invoices.id })
            .from(invoices)
            .where(
              and(
                eq(invoices.reservationId, standReservations.id),
                ne(invoices.status, "cancelled"),
              ),
            ),
        ),
      ),
    );
  return rows.map((row) => ({ reservationId: row.reservationId, value: row.value ?? 0 }));
}

/** The whole ledger of everyone who spent credits here, for the FIFO replay. */
async function loadCreditHistory(userIds: number[]) {
  if (userIds.length === 0) return { entries: [], topUps: [] };
  const [entries, topUpRows] = await Promise.all([
    db
      .select({
        id: creditLedgerEntries.id,
        userId: creditLedgerEntries.userId,
        type: creditLedgerEntries.type,
        amount: creditLedgerEntries.amount,
        createdAt: creditLedgerEntries.createdAt,
        topUpId: creditLedgerEntries.topUpId,
        reversesEntryId: creditLedgerEntries.reversesEntryId,
        metadata: creditLedgerEntries.metadata,
      })
      .from(creditLedgerEntries)
      .where(inArray(creditLedgerEntries.userId, userIds)),
    db
      .select({
        id: creditTopUps.id,
        status: creditTopUps.status,
        submittedAt: creditTopUps.submittedAt,
        intendedUseType: creditTopUps.intendedUseType,
        intendedUseId: creditTopUps.intendedUseId,
        invoiceFestivalId: standReservations.festivalId,
      })
      .from(creditTopUps)
      .leftJoin(
        invoices,
        and(
          eq(creditTopUps.intendedUseType, "invoice"),
          eq(invoices.id, creditTopUps.intendedUseId),
        ),
      )
      .leftJoin(standReservations, eq(standReservations.id, invoices.reservationId))
      .where(inArray(creditTopUps.userId, userIds)),
  ]);

  const topUps: AttributionTopUp[] = topUpRows.map((row) => ({
    id: row.id,
    status: row.status,
    submittedAt: row.submittedAt,
    intendedFestivalId:
      row.intendedUseType === "feature"
        ? row.intendedUseId
        : row.intendedUseType === "invoice"
          ? row.invoiceFestivalId
          : null,
  }));
  return { entries, topUps };
}

/** Everything the finance page and its export need for one festival. */
export async function fetchFestivalFinance(
  festivalId: number,
): Promise<FestivalFinance | null> {
  const [festival] = await db
    .select({
      id: festivals.id,
      name: festivals.name,
      reservationsStartDate: festivals.reservationsStartDate,
    })
    .from(festivals)
    .where(eq(festivals.id, festivalId))
    .limit(1);
  if (!festival) return null;

  const [customLeadDays, invoiceRows, featureSpends, freeReservations] =
    await Promise.all([
      fetchCreditLeadDays(festivalId),
      loadInvoices(festivalId),
      loadFeatureSpends(festivalId),
      loadFreeReservations(festivalId),
    ]);

  const spendIds = new Set([
    ...invoiceRows.flatMap((row) => row.creditSpendIds),
    ...featureSpends.map((spend) => spend.ledgerEntryId),
  ]);
  const spenders =
    spendIds.size === 0
      ? []
      : await db
          .selectDistinct({ userId: creditLedgerEntries.userId })
          .from(creditLedgerEntries)
          .where(inArray(creditLedgerEntries.id, [...spendIds]));
  const { entries, topUps } = await loadCreditHistory(
    spenders.map((row) => row.userId),
  );

  const leadDays = customLeadDays ?? DEFAULT_CREDIT_LEAD_DAYS;
  const windowStart = creditWindowStart(festival.reservationsStartDate, leadDays);
  const summary = summarizeFestivalFinance({
    festivalId,
    invoices: invoiceRows,
    featureSpends,
    freeReservations,
    attribution: attributeCreditSpends(entries, topUps),
    windowStart,
    now: new Date(),
  });

  return {
    festival,
    leadDays,
    leadDaysCustom: customLeadDays != null,
    windowStart,
    summary,
    rows: invoiceRows,
  };
}
