import "server-only";

import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";

import {
  calculateCreditBalances,
  type CreditBalances,
} from "@/app/lib/credits/balances";
import { readCreditBalances } from "@/app/lib/credits/service";
import { roundMoney } from "@/app/lib/reservations/money";
import { canViewAdminReservationData } from "@/app/lib/reservations/policy";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { db } from "@/db";
import {
  creditAccounts,
  creditHolds,
  creditLedgerEntries,
  creditTopUps,
  festivals,
  invoiceCreditAllocations,
  invoices,
  standReservations,
  users,
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
  /** The admin entry this one undoes, when it undoes one. */
  reversesEntryId: number | null;
  /**
   * Whether a later entry already undoes this one.
   *
   * Computed across the whole ledger, not just the page being shown: an
   * adjustment reverted months later would otherwise still offer its button.
   */
  isReverted: boolean;
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
  if (
    status === "awaiting_voucher" &&
    uploadDeadlineAt.getTime() <= now.getTime()
  ) {
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
        reversesEntryId: creditLedgerEntries.reversesEntryId,
      })
      .from(creditLedgerEntries)
      .leftJoin(
        invoiceCreditAllocations,
        eq(invoiceCreditAllocations.ledgerEntryId, creditLedgerEntries.id),
      )
      .where(eq(creditLedgerEntries.userId, userId))
      .orderBy(
        desc(creditLedgerEntries.createdAt),
        desc(creditLedgerEntries.id),
      )
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

  // One extra read rather than a self-join per row: the answer is only needed
  // for the entries actually being shown, and an undo can be far newer than
  // the entry it undoes.
  const reversedTargets = entryRows
    .map((row) => row.id)
    .filter((id): id is number => id != null);
  const revertedIds = new Set<number>();
  if (reversedTargets.length > 0) {
    const rows = await db
      .select({ reversesEntryId: creditLedgerEntries.reversesEntryId })
      .from(creditLedgerEntries)
      .where(inArray(creditLedgerEntries.reversesEntryId, reversedTargets));
    for (const row of rows) {
      if (row.reversesEntryId != null) revertedIds.add(row.reversesEntryId);
    }
  }

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
      reversesEntryId: row.reversesEntryId,
      isReverted: revertedIds.has(row.id),
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

/**
 * One purchase, for the page that finishes it.
 *
 * Scoped to its owner rather than fetched by id alone: the purchase page is a
 * payment screen, and somebody else's amount and deadline are not theirs to
 * read.
 */
export async function fetchCreditTopUpForOwner(
  topUpId: number,
  userId: number,
  now = new Date(),
): Promise<CreditWalletTopUp | null> {
  const actor = await getCurrentUserProfile();
  if (!actor) return null;
  if (
    actor.id !== userId &&
    !canViewAdminReservationData({ id: actor.id, role: actor.role })
  ) {
    return null;
  }

  // Fetched by id rather than scanned out of the wallet page: a purchase older
  // than the wallet's most recent rows is still a payment screen its owner can
  // open.
  const [row] = await db
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
    .where(and(eq(creditTopUps.id, topUpId), eq(creditTopUps.userId, userId)))
    .limit(1);
  if (!row) return null;

  const [target] =
    row.intendedUseType === "invoice" && row.intendedUseId
      ? await db
          .select({
            reservationId: invoices.reservationId,
            festivalId: standReservations.festivalId,
          })
          .from(invoices)
          .innerJoin(
            standReservations,
            eq(standReservations.id, invoices.reservationId),
          )
          .where(eq(invoices.id, row.intendedUseId))
          .limit(1)
      : [];

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
}

/** Credit balances for the signed-in participant, or null when signed out. */
export async function fetchCurrentUserCreditBalances(): Promise<CreditBalances | null> {
  const actor = await getCurrentUserProfile();
  if (!actor) return null;
  return readCreditBalances(actor.id);
}

export type CreditTopUpReviewSpend = {
  id: number;
  amount: number;
  createdAt: Date;
  invoiceId: number | null;
  featureActionId: number | null;
};

export type CreditTopUpReviewItem = {
  id: number;
  amount: number;
  status: CreditTopUpDisplayStatus;
  voucherUrl: string | null;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  rejectionReason: string | null;
  intendedUseType: "feature" | "invoice" | "debt";
  intendedUseId: number | null;
  invoiceReservationId: number | null;
  invoiceFestivalId: number | null;
  user: {
    id: number;
    displayName: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string;
  };
  balances: CreditBalances;
  /**
   * Where a rejection would leave the ledger. Exact, unlike attributing
   * individual spends to a voucher — credits are fungible once posted.
   */
  balanceAfterReversal: number;
  /** Context only: spends posted since this voucher arrived. */
  recentSpends: CreditTopUpReviewSpend[];
};

/**
 * Balances for several accounts in one pass. The review queue would otherwise
 * open a transaction per row.
 */
async function readCreditBalancesForUsers(
  userIds: readonly number[],
): Promise<Map<number, CreditBalances>> {
  const result = new Map<number, CreditBalances>();
  if (userIds.length === 0) return result;

  const [ledgerRows, holdRows, underReviewRows] = await Promise.all([
    db
      .select({
        userId: creditLedgerEntries.userId,
        amount: sql<number>`coalesce(sum(${creditLedgerEntries.amount}), 0)`,
      })
      .from(creditLedgerEntries)
      .where(inArray(creditLedgerEntries.userId, [...userIds]))
      .groupBy(creditLedgerEntries.userId),
    db
      .select({
        userId: creditHolds.userId,
        amount: sql<number>`coalesce(sum(${creditHolds.amount}), 0)`,
      })
      .from(creditHolds)
      .where(
        and(
          inArray(creditHolds.userId, [...userIds]),
          eq(creditHolds.status, "active"),
        ),
      )
      .groupBy(creditHolds.userId),
    db
      .select({
        userId: creditTopUps.userId,
        amount: sql<number>`coalesce(sum(${creditTopUps.amount}), 0)`,
      })
      .from(creditTopUps)
      .where(
        and(
          inArray(creditTopUps.userId, [...userIds]),
          eq(creditTopUps.status, "under_review"),
        ),
      )
      .groupBy(creditTopUps.userId),
  ]);

  const byUser = (rows: Array<{ userId: number; amount: number }>) =>
    new Map(rows.map((row) => [row.userId, Number(row.amount)]));
  const ledger = byUser(ledgerRows);
  const holds = byUser(holdRows);
  const underReview = byUser(underReviewRows);

  for (const userId of userIds) {
    result.set(
      userId,
      calculateCreditBalances({
        ledgerBalance: ledger.get(userId) ?? 0,
        activeHolds: holds.get(userId) ?? 0,
        underReviewIssuance: underReview.get(userId) ?? 0,
      }),
    );
  }
  return result;
}

export const REVIEW_QUEUE_PAGE_SIZE = 50;

export type CreditTopUpReviewQueue = {
  items: CreditTopUpReviewItem[];
  /** Every row matching the scope, not just the page. */
  totalCount: number;
  /** True when the scope holds more rows than this page returned. */
  hasMore: boolean;
};

/**
 * Admin review queue. Readable by global and festival admins; only a global
 * admin can act on it, which `reviewCreditTopUp` enforces separately.
 *
 * `pending` lists vouchers awaiting a decision, oldest submission first, so a
 * backlog past one page still drains as the page is worked through. The count
 * is reported separately because a page that silently hides queued vouchers
 * reads as an empty queue, and an unreviewed voucher blocks its participant.
 *
 * `reviewed` lists recent decisions so a mistake stays visible instead of
 * disappearing from the queue.
 */
export async function fetchCreditTopUpReviewQueue(
  scope: "pending" | "reviewed" = "pending",
  now = new Date(),
): Promise<CreditTopUpReviewQueue | null> {
  const actor = await getCurrentUserProfile();
  if (!canViewAdminReservationData(actor)) return null;

  const scopeFilter =
    scope === "pending"
      ? eq(creditTopUps.status, "under_review")
      : sql`${creditTopUps.status} IN ('approved', 'rejected')`;

  const [rows, countRows] = await Promise.all([
    db
      .select({
        id: creditTopUps.id,
        amount: creditTopUps.amount,
        status: creditTopUps.status,
        voucherUrl: creditTopUps.voucherUrl,
        submittedAt: creditTopUps.submittedAt,
        reviewedAt: creditTopUps.reviewedAt,
        rejectionReason: creditTopUps.rejectionReason,
        intendedUseType: creditTopUps.intendedUseType,
        intendedUseId: creditTopUps.intendedUseId,
        uploadDeadlineAt: creditTopUps.uploadDeadlineAt,
        userId: users.id,
        displayName: users.displayName,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      })
      .from(creditTopUps)
      .innerJoin(users, eq(users.id, creditTopUps.userId))
      .where(scopeFilter)
      .orderBy(
        scope === "pending"
          ? creditTopUps.submittedAt
          : desc(creditTopUps.reviewedAt),
      )
      .limit(REVIEW_QUEUE_PAGE_SIZE),
    db
      .select({ total: sql<number>`count(*)` })
      .from(creditTopUps)
      .innerJoin(users, eq(users.id, creditTopUps.userId))
      .where(scopeFilter),
  ]);

  const totalCount = Number(countRows[0]?.total ?? rows.length);

  if (rows.length === 0) {
    return { items: [], totalCount, hasMore: false };
  }

  const userIds = [...new Set(rows.map((row) => row.userId))];
  const balancesByUser = await readCreditBalancesForUsers(userIds);

  const invoiceIds = rows
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

  const earliestSubmission = rows.reduce<Date | null>((earliest, row) => {
    if (!row.submittedAt) return earliest;
    if (!earliest || row.submittedAt < earliest) return row.submittedAt;
    return earliest;
  }, null);
  const spendRows = earliestSubmission
    ? await db
        .select({
          id: creditLedgerEntries.id,
          userId: creditLedgerEntries.userId,
          amount: creditLedgerEntries.amount,
          createdAt: creditLedgerEntries.createdAt,
          featureActionId: creditLedgerEntries.featureActionId,
          invoiceId: invoiceCreditAllocations.invoiceId,
        })
        .from(creditLedgerEntries)
        .leftJoin(
          invoiceCreditAllocations,
          eq(invoiceCreditAllocations.ledgerEntryId, creditLedgerEntries.id),
        )
        .where(
          and(
            inArray(creditLedgerEntries.userId, userIds),
            eq(creditLedgerEntries.type, "spend"),
            gte(creditLedgerEntries.createdAt, earliestSubmission),
          ),
        )
        .orderBy(desc(creditLedgerEntries.createdAt))
    : [];

  const items = rows.map((row) => {
    const target =
      row.intendedUseType === "invoice" && row.intendedUseId
        ? invoiceById.get(row.intendedUseId)
        : undefined;
    const balances =
      balancesByUser.get(row.userId) ??
      calculateCreditBalances({
        ledgerBalance: 0,
        activeHolds: 0,
        underReviewIssuance: 0,
      });
    const amount = Number(row.amount);
    return {
      id: row.id,
      amount,
      status: displayTopUpStatus(row.status, row.uploadDeadlineAt, now),
      voucherUrl: row.voucherUrl,
      submittedAt: row.submittedAt,
      reviewedAt: row.reviewedAt,
      rejectionReason: row.rejectionReason,
      intendedUseType: row.intendedUseType,
      intendedUseId: row.intendedUseId,
      invoiceReservationId: target?.reservationId ?? null,
      invoiceFestivalId: target?.festivalId ?? null,
      user: {
        id: row.userId,
        displayName: row.displayName,
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
      },
      balances,
      balanceAfterReversal: roundMoney(balances.ledgerBalance - amount),
      recentSpends: spendRows
        .filter(
          (spend) =>
            spend.userId === row.userId &&
            row.submittedAt != null &&
            spend.createdAt >= row.submittedAt,
        )
        .map((spend) => ({
          id: spend.id,
          amount: Number(spend.amount),
          createdAt: spend.createdAt,
          invoiceId: spend.invoiceId,
          featureActionId: spend.featureActionId,
        })),
    };
  });

  return { items, totalCount, hasMore: totalCount > items.length };
}

export type CreditDebtAccount = {
  user: {
    id: number;
    displayName: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string;
  };
  /** Canonical: the sum of posted ledger entries. Negative means owed. */
  ledgerBalance: number;
  /** Amount owed, as a positive number. Zero for a drift-only row. */
  debtAmount: number;
  cachedBalance: number;
  /**
   * The cached projection disagrees with the ledger. The ledger wins; a drift
   * row means the projection needs investigating, not that money moved.
   */
  hasDrift: boolean;
  /** When the reversal that most likely caused the debt was posted. */
  lastReversalAt: Date | null;
};

/**
 * Accounts needing admin attention: a negative balance from a reversed
 * top-up, or a cached projection that disagrees with the ledger.
 *
 * A negative balance blocks its participant from every credit operation, so
 * this list is a work queue, not a report.
 */
export async function fetchCreditDebtReport(): Promise<
  CreditDebtAccount[] | null
> {
  const actor = await getCurrentUserProfile();
  if (!canViewAdminReservationData(actor)) return null;

  const ledgerSum = sql<number>`coalesce(sum(${creditLedgerEntries.amount}), 0)`;
  const rows = await db
    .select({
      userId: users.id,
      displayName: users.displayName,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      cachedBalance: creditAccounts.cachedBalance,
      ledgerBalance: ledgerSum,
    })
    .from(creditAccounts)
    .innerJoin(users, eq(users.id, creditAccounts.userId))
    .leftJoin(
      creditLedgerEntries,
      eq(creditLedgerEntries.userId, creditAccounts.userId),
    )
    .groupBy(users.id, creditAccounts.userId)
    .having(
      sql`${ledgerSum} < 0 OR ${ledgerSum} <> ${creditAccounts.cachedBalance}`,
    )
    .orderBy(ledgerSum);

  if (rows.length === 0) return [];

  const userIds = rows.map((row) => row.userId);
  const reversals = await db
    .select({
      userId: creditLedgerEntries.userId,
      createdAt: creditLedgerEntries.createdAt,
    })
    .from(creditLedgerEntries)
    .where(
      and(
        inArray(creditLedgerEntries.userId, userIds),
        eq(creditLedgerEntries.type, "reversal"),
      ),
    )
    .orderBy(desc(creditLedgerEntries.createdAt));
  const lastReversalByUser = new Map<number, Date>();
  for (const row of reversals) {
    if (!lastReversalByUser.has(row.userId)) {
      lastReversalByUser.set(row.userId, row.createdAt);
    }
  }

  return rows.map((row) => {
    const ledgerBalance = roundMoney(Number(row.ledgerBalance));
    const cachedBalance = roundMoney(Number(row.cachedBalance));
    return {
      user: {
        id: row.userId,
        displayName: row.displayName,
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
      },
      ledgerBalance,
      debtAmount: Math.max(0, roundMoney(-ledgerBalance)),
      cachedBalance,
      hasDrift: ledgerBalance !== cachedBalance,
      lastReversalAt: lastReversalByUser.get(row.userId) ?? null,
    };
  });
}

export type FeatureHoldStatus = "active" | "captured" | "released" | "expired";

export type FeatureHold = {
  featureActionId: number;
  festivalId: number;
  festivalName: string;
  amount: number;
  status: FeatureHoldStatus;
  reservedAt: Date;
  /** When it stopped being active, or null while it still is. */
  closedAt: Date | null;
};

/**
 * Every feature earmark this participant has had, open or closed.
 *
 * Held credits are the one balance a participant can move on their own, and
 * until now the only control that released them lived on the festival's
 * reservation map. Somebody whose voucher was rejected after activating ends
 * up with a hold and no credits behind it — the wallet reads as a debt, the
 * map may be closed, and nothing on either screen says the hold is theirs to
 * let go.
 *
 * Closed ones are kept because reserving and releasing are the only things
 * that move a balance without posting a ledger entry. Dropping them on release
 * took the whole episode out of the history and left an unexplained dip.
 *
 * `updatedAt` stands in for the closing time: a hold row is only ever written
 * to change its status, so the two coincide.
 */
export async function fetchFeatureHolds(
  userId: number,
): Promise<FeatureHold[]> {
  // Same gate as `fetchCreditWallet`: this says what somebody activated, at
  // which festival and for how much. It is only ever called with the signed-in
  // participant today, but a read that takes a `userId` and checks nothing is
  // one careless caller away from leaking somebody else's.
  const actor = await getCurrentUserProfile();
  if (!actor) return [];
  if (
    actor.id !== userId &&
    !canViewAdminReservationData({ id: actor.id, role: actor.role })
  ) {
    return [];
  }

  const rows = await db
    .select({
      featureActionId: creditHolds.featureActionId,
      festivalId: creditHolds.festivalId,
      festivalName: festivals.name,
      amount: creditHolds.amount,
      status: creditHolds.status,
      createdAt: creditHolds.createdAt,
      updatedAt: creditHolds.updatedAt,
    })
    .from(creditHolds)
    .innerJoin(festivals, eq(festivals.id, creditHolds.festivalId))
    .where(eq(creditHolds.userId, userId))
    .orderBy(desc(creditHolds.createdAt));

  return rows.map((row) => ({
    featureActionId: row.featureActionId,
    festivalId: row.festivalId,
    festivalName: row.festivalName,
    amount: Number(row.amount),
    status: row.status,
    reservedAt: row.createdAt,
    closedAt: row.status === "active" ? null : row.updatedAt,
  }));
}
