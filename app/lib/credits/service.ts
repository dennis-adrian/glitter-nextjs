import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";

import {
  calculateCreditBalances,
  canFundInvoiceCreditAllocation,
  type CreditBalances,
  exactCreditShortfall,
  roundCredits,
} from "@/app/lib/credits/balances";
import { lockUserRows } from "@/app/lib/reservations/locks";
import { db } from "@/db";
import {
  creditAccounts,
  creditHolds,
  creditLedgerEntries,
  creditTopUps,
  pendingUserDeletions,
  reservationFeatureActions,
} from "@/db/schema";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type CreditTx = DbTx;

const TOP_UP_UPLOAD_WINDOW_MS = 10 * 60 * 1000;

export const CREDIT_FAILURE_CODES = [
  "INVALID_AMOUNT",
  "TOP_UP_NOT_FOUND",
  "TOP_UP_NOT_OWNED",
  "TOP_UP_EXPIRED",
  "TOP_UP_NOT_REVIEWABLE",
  "TOP_UP_FILE_CONFLICT",
  "INSUFFICIENT_CREDITS",
  "NOT_IN_DEBT",
  "AMOUNT_EXCEEDS_DEBT",
  "HOLD_NOT_ACTIVE",
  "IDEMPOTENCY_CONFLICT",
  "USER_DELETION_PENDING",
] as const;
export type CreditFailureCode = (typeof CREDIT_FAILURE_CODES)[number];

export type CreditResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: CreditFailureCode };

function failure(code: CreditFailureCode): CreditResult<never> {
  return { ok: false, code };
}

function positiveCreditAmount(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  const rounded = roundCredits(value);
  return rounded > 0 && Math.abs(rounded - value) < 1e-9 ? rounded : null;
}

async function lockCreditUserForMutation(tx: DbTx, userId: number) {
  // Profile deletion takes the same user lock before creating its pending row,
  // so either this mutation commits first or it observes and rejects deletion.
  await lockUserRows(tx, [userId]);

  const [pendingDeletion] = await tx
    .select({ id: pendingUserDeletions.id })
    .from(pendingUserDeletions)
    .where(
      and(
        eq(pendingUserDeletions.userId, userId),
        isNull(pendingUserDeletions.localDeletedAt),
      ),
    )
    .limit(1);

  return !pendingDeletion;
}

async function lockCreditAccount(tx: DbTx, userId: number) {
  await tx
    .insert(creditAccounts)
    .values({ userId })
    .onConflictDoNothing({ target: creditAccounts.userId });

  const [account] = await tx
    .select({
      userId: creditAccounts.userId,
      cachedBalance: creditAccounts.cachedBalance,
      version: creditAccounts.version,
    })
    .from(creditAccounts)
    .where(eq(creditAccounts.userId, userId))
    .limit(1)
    .for("update");
  return account ?? null;
}

async function lockedCreditBalances(
  tx: DbTx,
  userId: number,
): Promise<CreditBalances> {
  const [ledger] = await tx
    .select({
      amount: sql<number>`coalesce(sum(${creditLedgerEntries.amount}), 0)`,
    })
    .from(creditLedgerEntries)
    .where(eq(creditLedgerEntries.userId, userId));
  const [holds] = await tx
    .select({ amount: sql<number>`coalesce(sum(${creditHolds.amount}), 0)` })
    .from(creditHolds)
    .where(
      and(
        eq(creditHolds.userId, userId),
        eq(creditHolds.status, "active"),
      ),
    );
  const [underReview] = await tx
    .select({ amount: sql<number>`coalesce(sum(${creditTopUps.amount}), 0)` })
    .from(creditTopUps)
    .where(
      and(
        eq(creditTopUps.userId, userId),
        eq(creditTopUps.status, "under_review"),
      ),
    );

  return calculateCreditBalances({
    ledgerBalance: Number(ledger?.amount ?? 0),
    activeHolds: Number(holds?.amount ?? 0),
    underReviewIssuance: Number(underReview?.amount ?? 0),
  });
}

/** Caller must already hold the account row through `lockCreditAccountRows`. */
export async function getCreditBalancesInTx(tx: CreditTx, userId: number) {
  return lockedCreditBalances(tx, userId);
}

/**
 * Snapshot read for display. It takes no row locks, so a mutation must still
 * use `getCreditBalancesInTx` while holding the credit account.
 */
export async function readCreditBalances(
  userId: number,
): Promise<CreditBalances> {
  return db.transaction((tx) => lockedCreditBalances(tx, userId));
}

async function updateCachedBalance(tx: DbTx, userId: number, delta: number) {
  await tx
    .update(creditAccounts)
    .set({
      cachedBalance: sql`${creditAccounts.cachedBalance} + ${delta}`,
      version: sql`${creditAccounts.version} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(creditAccounts.userId, userId));
}

async function lockOwnedFeatureAction(
  tx: DbTx,
  featureActionId: number,
  userId: number,
) {
  const [action] = await tx
    .select({
      id: reservationFeatureActions.id,
      festivalId: reservationFeatureActions.festivalId,
      type: reservationFeatureActions.type,
    })
    .from(reservationFeatureActions)
    .where(
      and(
        eq(reservationFeatureActions.id, featureActionId),
        eq(reservationFeatureActions.ownerUserId, userId),
      ),
    )
    .limit(1)
    .for("update");
  return action ?? null;
}

export type CreditTopUpRequirement = {
  userId: number;
  amount: number;
  intendedUseType: "feature" | "invoice" | "debt";
  intendedUseId?: number;
  idempotencyKey: string;
  now?: Date;
};

/**
 * Internal-only entry point. A caller owning the invoice or feature must
 * calculate its authoritative shortfall first; never pass browser pricing.
 */
export async function createCreditTopUpForRequirement(
  input: CreditTopUpRequirement,
): Promise<CreditResult<{ id: number; amount: number; uploadDeadlineAt: Date }>> {
  return db.transaction((tx) => createCreditTopUpForRequirementInTx(tx, input));
}

/**
 * Transaction-scoped variant for callers that already hold the canonical
 * reservation/credit locks. Re-taking the user and account locks here is a
 * no-op for an owner that holds them, so the §14 order is preserved.
 */
export async function createCreditTopUpForRequirementInTx(
  tx: CreditTx,
  input: CreditTopUpRequirement,
): Promise<CreditResult<{ id: number; amount: number; uploadDeadlineAt: Date }>> {
  const amount = positiveCreditAmount(input.amount);
  if (amount == null || !input.idempotencyKey.trim()) {
    return failure("INVALID_AMOUNT");
  }
  const now = input.now ?? new Date();
  const uploadDeadlineAt = new Date(now.getTime() + TOP_UP_UPLOAD_WINDOW_MS);

  {
    if (!(await lockCreditUserForMutation(tx, input.userId))) {
      return failure("USER_DELETION_PENDING");
    }
    await lockCreditAccount(tx, input.userId);

    const [created] = await tx
      .insert(creditTopUps)
      .values({
        userId: input.userId,
        amount,
        intendedUseType: input.intendedUseType,
        intendedUseId: input.intendedUseId ?? null,
        uploadDeadlineAt,
        idempotencyKey: input.idempotencyKey,
      })
      .onConflictDoNothing({ target: creditTopUps.idempotencyKey })
      .returning({
        id: creditTopUps.id,
        amount: creditTopUps.amount,
        uploadDeadlineAt: creditTopUps.uploadDeadlineAt,
      });
    if (created) return { ok: true, data: created };

    const [existing] = await tx
      .select({
        id: creditTopUps.id,
        amount: creditTopUps.amount,
        uploadDeadlineAt: creditTopUps.uploadDeadlineAt,
      })
      .from(creditTopUps)
      .where(
        and(
          eq(creditTopUps.idempotencyKey, input.idempotencyKey),
          eq(creditTopUps.userId, input.userId),
        ),
      )
      .limit(1)
      .for("update");
    if (!existing) return failure("TOP_UP_NOT_FOUND");
    if (existing.amount !== amount) return failure("IDEMPOTENCY_CONFLICT");
    return { ok: true, data: existing };
  }
}

export async function getCreditTopUpUploadTarget(input: {
  topUpId: number;
  userId: number;
  now?: Date;
}): Promise<CreditResult<{ topUpId: number }>> {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    if (!(await lockCreditUserForMutation(tx, input.userId))) {
      return failure("USER_DELETION_PENDING");
    }
    const [topUp] = await tx
      .select()
      .from(creditTopUps)
      .where(eq(creditTopUps.id, input.topUpId))
      .limit(1)
      .for("update");
    if (!topUp) return failure("TOP_UP_NOT_FOUND");
    if (topUp.userId !== input.userId) return failure("TOP_UP_NOT_OWNED");
    if (topUp.status !== "awaiting_voucher") return failure("TOP_UP_NOT_REVIEWABLE");
    if (topUp.uploadDeadlineAt.getTime() <= now.getTime()) {
      await tx
        .update(creditTopUps)
        .set({ status: "expired", updatedAt: now })
        .where(eq(creditTopUps.id, topUp.id));
      return failure("TOP_UP_EXPIRED");
    }
    return { ok: true, data: { topUpId: topUp.id } };
  });
}

/** Called only by the authoritative UploadThing completion callback. */
export async function submitCreditTopUpVoucher(input: {
  topUpId: number;
  userId: number;
  voucherUrl: string;
  fileKey: string;
  now?: Date;
}): Promise<CreditResult<{ topUpId: number; balances: CreditBalances }>> {
  if (!input.voucherUrl || !input.fileKey) return failure("INVALID_AMOUNT");
  const now = input.now ?? new Date();

  return db.transaction(async (tx) => {
    if (!(await lockCreditUserForMutation(tx, input.userId))) {
      return failure("USER_DELETION_PENDING");
    }
    await lockCreditAccount(tx, input.userId);
    const existingEntries = await tx
      .select({ id: creditLedgerEntries.id })
      .from(creditLedgerEntries)
      .where(eq(creditLedgerEntries.topUpId, input.topUpId))
      .for("update");
    const [topUp] = await tx
      .select()
      .from(creditTopUps)
      .where(eq(creditTopUps.id, input.topUpId))
      .limit(1)
      .for("update");
    if (!topUp) return failure("TOP_UP_NOT_FOUND");
    if (topUp.userId !== input.userId) return failure("TOP_UP_NOT_OWNED");

    if (topUp.status === "under_review") {
      if (topUp.fileKey !== input.fileKey || existingEntries.length !== 1) {
        return failure("TOP_UP_FILE_CONFLICT");
      }
      return {
        ok: true,
        data: { topUpId: topUp.id, balances: await lockedCreditBalances(tx, input.userId) },
      };
    }
    if (topUp.status !== "awaiting_voucher") return failure("TOP_UP_NOT_REVIEWABLE");
    if (topUp.uploadDeadlineAt.getTime() <= now.getTime()) {
      await tx
        .update(creditTopUps)
        .set({ status: "expired", updatedAt: now })
        .where(eq(creditTopUps.id, topUp.id));
      return failure("TOP_UP_EXPIRED");
    }

    await tx.insert(creditLedgerEntries).values({
      userId: input.userId,
      amount: topUp.amount,
      type: "top_up",
      topUpId: topUp.id,
      idempotencyKey: `credit-top-up:${topUp.id}:issue`,
      metadata: { fileKey: input.fileKey },
    });
    await updateCachedBalance(tx, input.userId, topUp.amount);
    await tx
      .update(creditTopUps)
      .set({
        status: "under_review",
        voucherUrl: input.voucherUrl,
        fileKey: input.fileKey,
        submittedAt: now,
        updatedAt: now,
      })
      .where(eq(creditTopUps.id, topUp.id));

    return {
      ok: true,
      data: { topUpId: topUp.id, balances: await lockedCreditBalances(tx, input.userId) },
    };
  });
}

export async function reviewCreditTopUp(input: {
  topUpId: number;
  reviewerUserId: number;
  decision: "approved" | "rejected";
  rejectionReason?: string;
  now?: Date;
}): Promise<CreditResult<{ topUpId: number; balances: CreditBalances }>> {
  if (input.decision === "rejected" && !input.rejectionReason?.trim()) {
    return failure("INVALID_AMOUNT");
  }
  const now = input.now ?? new Date();

  return db.transaction(async (tx) => {
    const [preview] = await tx
      .select({ userId: creditTopUps.userId })
      .from(creditTopUps)
      .where(eq(creditTopUps.id, input.topUpId))
      .limit(1);
    if (!preview) return failure("TOP_UP_NOT_FOUND");

    if (!(await lockCreditUserForMutation(tx, preview.userId))) {
      return failure("USER_DELETION_PENDING");
    }
    await lockCreditAccount(tx, preview.userId);
    const [issue] = await tx
      .select({ id: creditLedgerEntries.id })
      .from(creditLedgerEntries)
      .where(
        and(
          eq(creditLedgerEntries.topUpId, input.topUpId),
          eq(creditLedgerEntries.type, "top_up"),
        ),
      )
      .limit(1)
      .for("update");
    const [topUp] = await tx
      .select()
      .from(creditTopUps)
      .where(eq(creditTopUps.id, input.topUpId))
      .limit(1)
      .for("update");
    if (!topUp) return failure("TOP_UP_NOT_FOUND");
    if (input.decision === "approved" && topUp.status === "approved") {
      return {
        ok: true,
        data: { topUpId: topUp.id, balances: await lockedCreditBalances(tx, topUp.userId) },
      };
    }
    if (input.decision === "rejected" && topUp.status === "rejected") {
      return {
        ok: true,
        data: { topUpId: topUp.id, balances: await lockedCreditBalances(tx, topUp.userId) },
      };
    }
    if (topUp.status !== "under_review" || !issue) {
      return failure("TOP_UP_NOT_REVIEWABLE");
    }

    if (input.decision === "rejected") {
      await tx.insert(creditLedgerEntries).values({
        userId: topUp.userId,
        amount: -topUp.amount,
        type: "reversal",
        topUpId: topUp.id,
        reversesEntryId: issue.id,
        idempotencyKey: `credit-top-up:${topUp.id}:reversal`,
        metadata: { reason: input.rejectionReason!.trim() },
      });
      await updateCachedBalance(tx, topUp.userId, -topUp.amount);
    }

    await tx
      .update(creditTopUps)
      .set({
        status: input.decision,
        reviewedByUserId: input.reviewerUserId,
        reviewedAt: now,
        rejectionReason:
          input.decision === "rejected" ? input.rejectionReason!.trim() : null,
        updatedAt: now,
      })
      .where(eq(creditTopUps.id, topUp.id));
    return {
      ok: true,
      data: { topUpId: topUp.id, balances: await lockedCreditBalances(tx, topUp.userId) },
    };
  });
}

export async function reconcileCreditAccount(userId: number): Promise<{
  cachedBalance: number;
  ledgerBalance: number;
  matches: boolean;
  balances: CreditBalances;
}> {
  return db.transaction(async (tx) => {
    await lockUserRows(tx, [userId]);
    const account = await lockCreditAccount(tx, userId);
    const balances = await lockedCreditBalances(tx, userId);
    return {
      cachedBalance: Number(account?.cachedBalance ?? 0),
      ledgerBalance: balances.ledgerBalance,
      matches: Number(account?.cachedBalance ?? 0) === balances.ledgerBalance,
      balances,
    };
  });
}

function canFundCreditOperation(balances: CreditBalances, amount: number) {
  return balances.ledgerBalance >= 0 && balances.spendableBalance >= amount;
}

/**
 * Transaction-scoped debit for Phase 1B. The caller owns authorization and
 * must have locked the user and credit account in the canonical combined
 * reservation/credit order before calling this. It intentionally creates no
 * allocation row: the invoice service inserts that row with the returned
 * ledger id in the same transaction.
 */
export async function debitConfirmedCreditsForInvoiceInTx(
  tx: CreditTx,
  input: {
    userId: number;
    amount: number;
    idempotencyKey: string;
  },
): Promise<CreditResult<{ ledgerEntryId: number; balances: CreditBalances }>> {
  const amount = positiveCreditAmount(input.amount);
  if (amount == null || !input.idempotencyKey.trim()) {
    return failure("INVALID_AMOUNT");
  }

  const [existing] = await tx
    .select({
      id: creditLedgerEntries.id,
      userId: creditLedgerEntries.userId,
      amount: creditLedgerEntries.amount,
      type: creditLedgerEntries.type,
      featureActionId: creditLedgerEntries.featureActionId,
    })
    .from(creditLedgerEntries)
    .where(eq(creditLedgerEntries.idempotencyKey, input.idempotencyKey))
    .limit(1)
    .for("update");
  if (existing) {
    if (
      existing.userId !== input.userId ||
      Number(existing.amount) !== -amount ||
      existing.type !== "spend" ||
      existing.featureActionId != null
    ) {
      return failure("IDEMPOTENCY_CONFLICT");
    }
    return {
      ok: true,
      data: {
        ledgerEntryId: existing.id,
        balances: await lockedCreditBalances(tx, input.userId),
      },
    };
  }

  const balances = await lockedCreditBalances(tx, input.userId);
  if (!canFundInvoiceCreditAllocation(balances, amount)) {
    return failure("INSUFFICIENT_CREDITS");
  }

  const [entry] = await tx
    .insert(creditLedgerEntries)
    .values({
      userId: input.userId,
      amount: -amount,
      type: "spend",
      idempotencyKey: input.idempotencyKey,
    })
    .returning({ id: creditLedgerEntries.id });
  if (!entry) return failure("TOP_UP_NOT_FOUND");
  await updateCachedBalance(tx, input.userId, -amount);
  return {
    ok: true,
    data: {
      ledgerEntryId: entry.id,
      balances: await lockedCreditBalances(tx, input.userId),
    },
  };
}

/** Internal primitive for Phase 3 full-table activation. */
/**
 * Hold creation inside a caller's transaction.
 *
 * Full-table activation must create the feature action and its hold atomically
 * (PRD §7.3), so the caller owns the transaction.
 */
export async function createCreditHoldForFeatureInTx(
  tx: CreditTx,
  input: {
    userId: number;
    festivalId: number;
    featureActionId: number;
    amount: number;
    idempotencyKey: string;
    expiresAt?: Date;
  },
): Promise<CreditResult<{ holdId: number; balances: CreditBalances }>> {
  const amount = positiveCreditAmount(input.amount);
  if (amount == null || !input.idempotencyKey.trim()) {
    return failure("INVALID_AMOUNT");
  }

  {
    if (!(await lockCreditUserForMutation(tx, input.userId))) {
      return failure("USER_DELETION_PENDING");
    }
    await lockCreditAccount(tx, input.userId);
    const action = await lockOwnedFeatureAction(
      tx,
      input.featureActionId,
      input.userId,
    );
    if (!action || action.festivalId !== input.festivalId || action.type !== "full_table_access") {
      return failure("TOP_UP_NOT_FOUND");
    }
    const [existing] = await tx
      .select({
        id: creditHolds.id,
        status: creditHolds.status,
        amount: creditHolds.amount,
        idempotencyKey: creditHolds.idempotencyKey,
      })
      .from(creditHolds)
      .where(eq(creditHolds.featureActionId, input.featureActionId))
      .limit(1)
      .for("update");
    if (existing) {
      if (existing.status !== "active") return failure("HOLD_NOT_ACTIVE");
      if (
        existing.amount !== amount ||
        existing.idempotencyKey !== input.idempotencyKey
      ) {
        return failure("IDEMPOTENCY_CONFLICT");
      }
      return {
        ok: true,
        data: {
          holdId: existing.id,
          balances: await lockedCreditBalances(tx, input.userId),
        },
      };
    }
    const balances = await lockedCreditBalances(tx, input.userId);
    if (!canFundCreditOperation(balances, amount)) {
      return failure("INSUFFICIENT_CREDITS");
    }
    const [hold] = await tx
      .insert(creditHolds)
      .values({
        userId: input.userId,
        festivalId: input.festivalId,
        amount,
        purpose: "full_table_access",
        featureActionId: input.featureActionId,
        expiresAt: input.expiresAt ?? null,
        idempotencyKey: input.idempotencyKey,
      })
      .returning({ id: creditHolds.id });
    if (!hold) return failure("TOP_UP_NOT_FOUND");
    return {
      ok: true,
      data: {
        holdId: hold.id,
        balances: await lockedCreditBalances(tx, input.userId),
      },
    };
  }
}

export async function createCreditHoldForFeature(input: {
  userId: number;
  festivalId: number;
  featureActionId: number;
  amount: number;
  idempotencyKey: string;
  expiresAt?: Date;
}): Promise<CreditResult<{ holdId: number; balances: CreditBalances }>> {
  return db.transaction((tx) => createCreditHoldForFeatureInTx(tx, input));
}

/** Internal primitive for late partner/release and full-table capture. */
export async function spendCreditsForFeature(input: {
  userId: number;
  featureActionId: number;
  amount: number;
  idempotencyKey: string;
}): Promise<CreditResult<{ ledgerEntryId: number; balances: CreditBalances }>> {
  const amount = positiveCreditAmount(input.amount);
  if (amount == null || !input.idempotencyKey.trim()) {
    return failure("INVALID_AMOUNT");
  }
  return db.transaction(async (tx) => {
    if (!(await lockCreditUserForMutation(tx, input.userId))) {
      return failure("USER_DELETION_PENDING");
    }
    await lockCreditAccount(tx, input.userId);
    if (!(await lockOwnedFeatureAction(tx, input.featureActionId, input.userId))) {
      return failure("TOP_UP_NOT_FOUND");
    }
    const [existing] = await tx
      .select({ id: creditLedgerEntries.id })
      .from(creditLedgerEntries)
      .where(
        and(
          eq(creditLedgerEntries.featureActionId, input.featureActionId),
          eq(creditLedgerEntries.type, "spend"),
        ),
      )
      .limit(1)
      .for("update");
    if (existing) {
      return {
        ok: true,
        data: {
          ledgerEntryId: existing.id,
          balances: await lockedCreditBalances(tx, input.userId),
        },
      };
    }
    const balances = await lockedCreditBalances(tx, input.userId);
    if (!canFundCreditOperation(balances, amount)) {
      return failure("INSUFFICIENT_CREDITS");
    }
    const [entry] = await tx
      .insert(creditLedgerEntries)
      .values({
        userId: input.userId,
        amount: -amount,
        type: "spend",
        featureActionId: input.featureActionId,
        idempotencyKey: input.idempotencyKey,
      })
      .returning({ id: creditLedgerEntries.id });
    if (!entry) return failure("TOP_UP_NOT_FOUND");
    await updateCachedBalance(tx, input.userId, -amount);
    return {
      ok: true,
      data: {
        ledgerEntryId: entry.id,
        balances: await lockedCreditBalances(tx, input.userId),
      },
    };
  });
}

/**
 * Capture inside a caller's transaction.
 *
 * Full-table confirmation must capture in the same transaction that creates the
 * two-stand reservation (PRD §7.6), and the §14 lock order puts credit classes
 * after stands and reservations — so the caller owns the transaction and calls
 * this last.
 */
export async function captureCreditHoldForFeatureInTx(
  tx: CreditTx,
  input: {
    userId: number;
    featureActionId: number;
    idempotencyKey: string;
  },
): Promise<CreditResult<{ ledgerEntryId: number; balances: CreditBalances }>> {
  if (!input.idempotencyKey.trim()) return failure("INVALID_AMOUNT");
  {
    if (!(await lockCreditUserForMutation(tx, input.userId))) {
      return failure("USER_DELETION_PENDING");
    }
    await lockCreditAccount(tx, input.userId);
    if (!(await lockOwnedFeatureAction(tx, input.featureActionId, input.userId))) {
      return failure("TOP_UP_NOT_FOUND");
    }
    const [hold] = await tx
      .select()
      .from(creditHolds)
      .where(eq(creditHolds.featureActionId, input.featureActionId))
      .limit(1)
      .for("update");
    if (!hold || hold.userId !== input.userId) return failure("TOP_UP_NOT_FOUND");
    const [existing] = await tx
      .select({ id: creditLedgerEntries.id })
      .from(creditLedgerEntries)
      .where(
        and(
          eq(creditLedgerEntries.featureActionId, input.featureActionId),
          eq(creditLedgerEntries.type, "spend"),
        ),
      )
      .limit(1)
      .for("update");
    if (existing) {
      return {
        ok: true,
        data: {
          ledgerEntryId: existing.id,
          balances: await lockedCreditBalances(tx, input.userId),
        },
      };
    }
    if (hold.status !== "active") return failure("TOP_UP_NOT_REVIEWABLE");
    const balances = await lockedCreditBalances(tx, input.userId);
    if (
      balances.ledgerBalance < 0 ||
      roundCredits(balances.spendableBalance + hold.amount) < hold.amount
    ) {
      return failure("INSUFFICIENT_CREDITS");
    }
    const [entry] = await tx
      .insert(creditLedgerEntries)
      .values({
        userId: input.userId,
        amount: -hold.amount,
        type: "spend",
        featureActionId: input.featureActionId,
        idempotencyKey: input.idempotencyKey,
      })
      .returning({ id: creditLedgerEntries.id });
    if (!entry) return failure("TOP_UP_NOT_FOUND");
    await updateCachedBalance(tx, input.userId, -hold.amount);
    await tx
      .update(creditHolds)
      .set({ status: "captured", updatedAt: new Date() })
      .where(eq(creditHolds.id, hold.id));
    return {
      ok: true,
      data: {
        ledgerEntryId: entry.id,
        balances: await lockedCreditBalances(tx, input.userId),
      },
    };
  }
}

/** Capture is the only spend path that may consume the caller's active hold. */
export async function captureCreditHoldForFeature(input: {
  userId: number;
  featureActionId: number;
  idempotencyKey: string;
}): Promise<CreditResult<{ ledgerEntryId: number; balances: CreditBalances }>> {
  return db.transaction((tx) => captureCreditHoldForFeatureInTx(tx, input));
}

/** Release inside a caller's transaction; see `captureCreditHoldForFeatureInTx`. */
export async function releaseCreditHoldForFeatureInTx(
  tx: CreditTx,
  input: {
    userId: number;
    featureActionId: number;
    status?: "released" | "expired";
  },
): Promise<CreditResult<{ balances: CreditBalances }>> {
  {
    if (!(await lockCreditUserForMutation(tx, input.userId))) {
      return failure("USER_DELETION_PENDING");
    }
    await lockCreditAccount(tx, input.userId);
    if (!(await lockOwnedFeatureAction(tx, input.featureActionId, input.userId))) {
      return failure("TOP_UP_NOT_FOUND");
    }
    const [hold] = await tx
      .select()
      .from(creditHolds)
      .where(eq(creditHolds.featureActionId, input.featureActionId))
      .limit(1)
      .for("update");
    if (!hold || hold.userId !== input.userId) return failure("TOP_UP_NOT_FOUND");
    if (hold.status === "active") {
      await tx
        .update(creditHolds)
        .set({ status: input.status ?? "released", updatedAt: new Date() })
        .where(eq(creditHolds.id, hold.id));
    }
    return {
      ok: true,
      data: { balances: await lockedCreditBalances(tx, input.userId) },
    };
  }
}

export async function releaseCreditHoldForFeature(input: {
  userId: number;
  featureActionId: number;
  status?: "released" | "expired";
}): Promise<CreditResult<{ balances: CreditBalances }>> {
  return db.transaction((tx) => releaseCreditHoldForFeatureInTx(tx, input));
}

/** Append-only administrative grant/correction; positive amounts can waive debt. */
export const CREDIT_DEBT_RESOLUTIONS = ["mark_paid", "waive"] as const;
export type CreditDebtResolution = (typeof CREDIT_DEBT_RESOLUTIONS)[number];

/**
 * Clears all or part of a negative balance left by a top-up reversal.
 *
 * Distinct from `adjustCreditAccount` because the invariants differ: the
 * account must actually be in debt, the credit may not exceed what is owed,
 * and the resolution kind is recorded. `mark_paid` and `waive` post the same
 * ledger movement but mean different things to accounting, so the reason
 * string alone would lose that.
 *
 * It never touches the domain: a reservation, partner, or release funded by
 * the reversed credits stays exactly as it was.
 */
export async function resolveCreditDebt(input: {
  userId: number;
  amount: number;
  resolution: CreditDebtResolution;
  reason: string;
  reviewerUserId: number;
  idempotencyKey: string;
}): Promise<CreditResult<{ ledgerEntryId: number; balances: CreditBalances }>> {
  const amount = positiveCreditAmount(input.amount);
  if (amount == null || !input.reason.trim() || !input.idempotencyKey.trim()) {
    return failure("INVALID_AMOUNT");
  }

  return db.transaction(async (tx) => {
    if (!(await lockCreditUserForMutation(tx, input.userId))) {
      return failure("USER_DELETION_PENDING");
    }
    await lockCreditAccount(tx, input.userId);

    const [existing] = await tx
      .select({
        id: creditLedgerEntries.id,
        userId: creditLedgerEntries.userId,
      })
      .from(creditLedgerEntries)
      .where(eq(creditLedgerEntries.idempotencyKey, input.idempotencyKey))
      .limit(1)
      .for("update");
    if (existing) {
      if (existing.userId !== input.userId) {
        return failure("IDEMPOTENCY_CONFLICT");
      }
      return {
        ok: true,
        data: {
          ledgerEntryId: existing.id,
          balances: await lockedCreditBalances(tx, input.userId),
        },
      };
    }

    // Recheck under the account lock: a concurrent resolution may already
    // have cleared some or all of the debt this admin was looking at.
    const balances = await lockedCreditBalances(tx, input.userId);
    const debt = roundCredits(-balances.ledgerBalance);
    if (debt <= 0) return failure("NOT_IN_DEBT");
    if (amount > debt) return failure("AMOUNT_EXCEEDS_DEBT");

    const [entry] = await tx
      .insert(creditLedgerEntries)
      .values({
        userId: input.userId,
        amount,
        type: "admin_adjustment",
        idempotencyKey: input.idempotencyKey,
        metadata: {
          reason: input.reason.trim(),
          resolution: input.resolution,
          reviewerUserId: String(input.reviewerUserId),
        },
      })
      .returning({ id: creditLedgerEntries.id });
    if (!entry) return failure("IDEMPOTENCY_CONFLICT");
    await updateCachedBalance(tx, input.userId, amount);

    return {
      ok: true,
      data: {
        ledgerEntryId: entry.id,
        balances: await lockedCreditBalances(tx, input.userId),
      },
    };
  });
}

export async function adjustCreditAccount(input: {
  userId: number;
  amount: number;
  reason: string;
  idempotencyKey: string;
}): Promise<CreditResult<{ ledgerEntryId: number; balances: CreditBalances }>> {
  if (
    !Number.isFinite(input.amount) ||
    input.amount === 0 ||
    Math.abs(roundCredits(input.amount) - input.amount) >= 1e-9 ||
    !input.reason.trim() ||
    !input.idempotencyKey.trim()
  ) {
    return failure("INVALID_AMOUNT");
  }
  const amount = roundCredits(input.amount);
  return db.transaction(async (tx) => {
    if (!(await lockCreditUserForMutation(tx, input.userId))) {
      return failure("USER_DELETION_PENDING");
    }
    await lockCreditAccount(tx, input.userId);
    const [existing] = await tx
      .select({
        id: creditLedgerEntries.id,
        userId: creditLedgerEntries.userId,
      })
      .from(creditLedgerEntries)
      .where(eq(creditLedgerEntries.idempotencyKey, input.idempotencyKey))
      .limit(1)
      .for("update");
    if (existing) {
      // The ledger key is intentionally global (per the PRD/schema), so an
      // entry for another user cannot safely fall through to an insert.
      if (existing.userId !== input.userId) {
        return failure("IDEMPOTENCY_CONFLICT");
      }
      return {
        ok: true,
        data: {
          ledgerEntryId: existing.id,
          balances: await lockedCreditBalances(tx, input.userId),
        },
      };
    }
    const [entry] = await tx
      .insert(creditLedgerEntries)
      .values({
        userId: input.userId,
        amount,
        type: amount > 0 ? "admin_grant" : "admin_adjustment",
        idempotencyKey: input.idempotencyKey,
        metadata: { reason: input.reason.trim() },
      })
      .returning({ id: creditLedgerEntries.id });
    if (!entry) return failure("TOP_UP_NOT_FOUND");
    await updateCachedBalance(tx, input.userId, amount);
    return {
      ok: true,
      data: {
        ledgerEntryId: entry.id,
        balances: await lockedCreditBalances(tx, input.userId),
      },
    };
  });
}

export { exactCreditShortfall };
