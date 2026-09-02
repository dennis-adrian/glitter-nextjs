import "server-only";

import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { type CreditBalances } from "@/app/lib/credits/balances";
import { readCreditBalances } from "@/app/lib/credits/service";
import { canViewAdminReservationData } from "@/app/lib/reservations/policy";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { db } from "@/db";
import {
  creditLedgerEntries,
  creditTopUps,
  invoiceCreditAllocations,
  invoices,
  standReservations,
} from "@/db/schema";

/**
 * `awaiting_voucher` rows past their deadline are dead but stay in that status
 * until something touches them; the service expires them lazily on the next
 * upload attempt. Reads must never mutate, so the wallet derives the state it
 * shows instead of writing one.
 */
export type CreditTopUpDisplayStatus =
  | "awaiting_voucher"
  | "under_review"
  | "approved"
  | "rejected"
  | "expired";

export type CreditWalletTopUp = {
  id: number;
  amount: number;
  status: CreditTopUpDisplayStatus;
  intendedUseType: "feature" | "invoice" | "debt";
  intendedUseId: number | null;
  uploadDeadlineAt: Date;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  rejectionReason: string | null;
  createdAt: Date;
  /** Set when the top-up funds a reservation invoice that still exists. */
  invoiceReservationId: number | null;
  invoiceFestivalId: number | null;
};

export type CreditWalletEntry = {
  id: number;
  amount: number;
  type: "top_up" | "spend" | "reversal" | "admin_grant" | "admin_adjustment";
  topUpId: number | null;
  featureActionId: number | null;
  /** Set when the spend was posted against a reservation invoice. */
  invoiceId: number | null;
  reason: string | null;
  createdAt: Date;
};

export type CreditWallet = {
  balances: CreditBalances;
  topUps: CreditWalletTopUp[];
  entries: CreditWalletEntry[];
};

const LEDGER_PAGE_SIZE = 50;
const TOP_UP_PAGE_SIZE = 20;

function displayTopUpStatus(
  status: string,
  uploadDeadlineAt: Date,
  now: Date,
): CreditTopUpDisplayStatus {
  if (status === "awaiting_voucher" && uploadDeadlineAt.getTime() <= now.getTime()) {
    return "expired";
  }
  return status as CreditTopUpDisplayStatus;
}

function readReason(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const reason = (metadata as { reason?: unknown }).reason;
  return typeof reason === "string" && reason.trim() ? reason.trim() : null;
}

/**
 * Owner-only wallet view, also readable by a global admin for support. The
 * ledger is immutable, so this is a plain read: nothing here expires, posts,
 * or corrects an entry.
 */
export async function fetchCreditWallet(
  userId: number,
  now = new Date(),
): Promise<CreditWallet | null> {
  const actor = await getCurrentUserProfile();
  if (!actor) return null;
  if (
    actor.id !== userId &&
    !canViewAdminReservationData({ id: actor.id, role: actor.role })
  ) {
    return null;
  }

  const [balances, topUpRows, entryRows] = await Promise.all([
    readCreditBalances(userId),
    db
      .select({
        id: creditTopUps.id,
        amount: creditTopUps.amount,
        status: creditTopUps.status,
        intendedUseType: creditTopUps.intendedUseType,
        intendedUseId: creditTopUps.intendedUseId,
        uploadDeadlineAt: creditTopUps.uploadDeadlineAt,
        submittedAt: creditTopUps.submittedAt,
        reviewedAt: creditTopUps.reviewedAt,
        rejectionReason: creditTopUps.rejectionReason,
        createdAt: creditTopUps.createdAt,
      })
      .from(creditTopUps)
      .where(eq(creditTopUps.userId, userId))
      .orderBy(desc(creditTopUps.createdAt))
      .limit(TOP_UP_PAGE_SIZE),
    db
      .select({
        id: creditLedgerEntries.id,
        amount: creditLedgerEntries.amount,
        type: creditLedgerEntries.type,
        topUpId: creditLedgerEntries.topUpId,
        featureActionId: creditLedgerEntries.featureActionId,
        invoiceId: invoiceCreditAllocations.invoiceId,
        metadata: creditLedgerEntries.metadata,
        createdAt: creditLedgerEntries.createdAt,
      })
      .from(creditLedgerEntries)
      .leftJoin(
        invoiceCreditAllocations,
        eq(invoiceCreditAllocations.ledgerEntryId, creditLedgerEntries.id),
      )
      .where(eq(creditLedgerEntries.userId, userId))
      .orderBy(desc(creditLedgerEntries.createdAt), desc(creditLedgerEntries.id))
      .limit(LEDGER_PAGE_SIZE),
  ]);

  const invoiceIds = topUpRows
    .filter((row) => row.intendedUseType === "invoice" && row.intendedUseId)
    .map((row) => row.intendedUseId!);
  const invoiceTargets = invoiceIds.length
    ? await db
        .select({
          id: invoices.id,
          reservationId: invoices.reservationId,
          festivalId: standReservations.festivalId,
        })
        .from(invoices)
        .innerJoin(
          standReservations,
          eq(standReservations.id, invoices.reservationId),
        )
        .where(inArray(invoices.id, invoiceIds))
    : [];
  const invoiceById = new Map(invoiceTargets.map((row) => [row.id, row]));

  return {
    balances,
    topUps: topUpRows.map((row) => {
      const target =
        row.intendedUseType === "invoice" && row.intendedUseId
          ? invoiceById.get(row.intendedUseId)
          : undefined;
      return {
        id: row.id,
        amount: Number(row.amount),
        status: displayTopUpStatus(row.status, row.uploadDeadlineAt, now),
        intendedUseType: row.intendedUseType,
        intendedUseId: row.intendedUseId,
        uploadDeadlineAt: row.uploadDeadlineAt,
        submittedAt: row.submittedAt,
        reviewedAt: row.reviewedAt,
        rejectionReason: row.rejectionReason,
        createdAt: row.createdAt,
        invoiceReservationId: target?.reservationId ?? null,
        invoiceFestivalId: target?.festivalId ?? null,
      };
    }),
    entries: entryRows.map((row) => ({
      id: row.id,
      amount: Number(row.amount),
      type: row.type,
      topUpId: row.topUpId,
      featureActionId: row.featureActionId,
      invoiceId: row.invoiceId,
      reason: readReason(row.metadata),
      createdAt: row.createdAt,
    })),
  };
}

/**
 * The single open top-up a participant can still upload a voucher for. The
 * wallet uses it to surface the countdown without scanning history.
 */
export async function fetchResumableCreditTopUp(
  userId: number,
  now = new Date(),
): Promise<CreditWalletTopUp | null> {
  const wallet = await fetchCreditWallet(userId, now);
  if (!wallet) return null;
  return (
    wallet.topUps.find((topUp) => topUp.status === "awaiting_voucher") ?? null
  );
}

/** Credit balances for the signed-in participant, or null when signed out. */
export async function fetchCurrentUserCreditBalances(): Promise<CreditBalances | null> {
  const actor = await getCurrentUserProfile();
  if (!actor) return null;
  return readCreditBalances(actor.id);
}

/**
 * Whether a pending invoice already has a credit purchase in flight, so the
 * payment page can point at the wallet instead of offering a second one.
 */
export async function fetchOpenInvoiceCreditTopUp(
  invoiceId: number,
  userId: number,
  now = new Date(),
): Promise<{ id: number; amount: number; status: CreditTopUpDisplayStatus } | null> {
  const rows = await db
    .select({
      id: creditTopUps.id,
      amount: creditTopUps.amount,
      status: creditTopUps.status,
      uploadDeadlineAt: creditTopUps.uploadDeadlineAt,
    })
    .from(creditTopUps)
    .where(
      and(
        eq(creditTopUps.userId, userId),
        eq(creditTopUps.intendedUseType, "invoice"),
        eq(creditTopUps.intendedUseId, invoiceId),
        sql`${creditTopUps.status} IN ('awaiting_voucher', 'under_review')`,
      ),
    )
    .orderBy(desc(creditTopUps.createdAt))
    .limit(5);

  for (const row of rows) {
    const status = displayTopUpStatus(row.status, row.uploadDeadlineAt, now);
    if (status === "expired") continue;
    return { id: row.id, amount: Number(row.amount), status };
  }
  return null;
}
