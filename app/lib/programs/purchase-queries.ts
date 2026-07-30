import "server-only";

import { desc, eq } from "drizzle-orm";
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
