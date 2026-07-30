import "server-only";

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/db";
import {
  programSettings,
  sessionPurchaseVouchers,
  sessionPurchases,
} from "@/db/schema";

/** Everything the secure access page and the profile area need to render. */
const purchaseWith = {
  program: true as const,
  lines: {
    with: {
      session: true as const,
      occurrence: { with: { venue: true as const } },
      ticket: true as const,
    },
  },
  // Newest first: the page only ever shows the current version, and the
  // ordering is what makes `vouchers[0]` mean that.
  vouchers: {
    orderBy: [desc(sessionPurchaseVouchers.version)],
  },
};

/**
 * Loads a purchase for the access check.
 *
 * Deliberately unfiltered by viewer: authorization is `resolvePurchaseAccess`'s
 * job, and doing it here would make it easy to render a page that forgot to
 * ask. The caller must not use the result before that check passes.
 */
export const fetchPurchaseForAccess = cache(async (purchaseId: number) => {
  return db.query.sessionPurchases.findFirst({
    where: eq(sessionPurchases.id, purchaseId),
    with: purchaseWith,
  });
});

export type PurchaseForAccess = NonNullable<
  Awaited<ReturnType<typeof fetchPurchaseForAccess>>
>;

/**
 * The admin review queue: paid purchases with a proof waiting on a decision.
 *
 * Ordered oldest first — a buyer who has been waiting longest is reviewed
 * first, and the seat they hold is the one blocking someone else.
 */
export const fetchPurchasesAwaitingReview = cache(async () => {
  return db.query.sessionPurchases.findMany({
    where: and(
      eq(sessionPurchases.paymentMode, "bank_qr"),
      inArray(sessionPurchases.status, [
        "under_verification",
        "changes_requested",
      ]),
    ),
    with: { ...purchaseWith, buyer: true },
    orderBy: [asc(sessionPurchases.voucherSubmittedAt)],
  });
});

export type PurchaseAwaitingReview = Awaited<
  ReturnType<typeof fetchPurchasesAwaitingReview>
>[number];

/** Bank QR and policy settings the payment step needs. */
export const fetchProgramSettings = cache(async () => {
  return db.query.programSettings.findFirst({
    where: eq(programSettings.key, "global"),
  });
});

/** A signed-in buyer's own purchases, for their profile area. */
export const fetchPurchasesForUser = cache(async (userId: number) => {
  return db.query.sessionPurchases.findMany({
    where: eq(sessionPurchases.userId, userId),
    with: purchaseWith,
    orderBy: [desc(sessionPurchases.createdAt)],
  });
});
