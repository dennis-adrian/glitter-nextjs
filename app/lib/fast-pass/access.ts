import "server-only";

import { eq } from "drizzle-orm";

import { hashAccessToken } from "@/app/lib/fast-pass/tokens";
import { digestsMatch } from "@/app/lib/security/digests";
import { db } from "@/db";
import { fastPassPurchases } from "@/db/schema";

export type FastPassPurchaseAccessDenial =
  | "not_found"
  | "no_token"
  | "token_revoked"
  | "token_mismatch";

export type FastPassPurchaseAccess =
  | { granted: true }
  | { granted: false; reason: FastPassPurchaseAccessDenial };

export type FastPassAccessSubject = {
  accessTokenHash: string | null;
  accessTokenRevokedAt: Date | null;
};

/**
 * Resolves bearer-token access to an online FastPass purchase. Online
 * purchases have no signed-in owner — the secure link is the only credential.
 */
export function resolvePurchaseAccessFromSubject(
  purchase: FastPassAccessSubject,
  token: string | null | undefined,
): FastPassPurchaseAccess {
  if (!token?.trim()) {
    return { granted: false, reason: "no_token" };
  }

  if (!purchase.accessTokenHash) {
    return { granted: false, reason: "token_mismatch" };
  }

  if (purchase.accessTokenRevokedAt !== null) {
    return { granted: false, reason: "token_revoked" };
  }

  const presentedHash = hashAccessToken(token);
  if (digestsMatch(presentedHash, purchase.accessTokenHash)) {
    return { granted: true };
  }

  return { granted: false, reason: "token_mismatch" };
}

/** Loads the purchase and checks the presented raw token against its digest. */
export async function resolvePurchaseAccess(
  purchaseId: number,
  token: string | null | undefined,
): Promise<FastPassPurchaseAccess> {
  const purchase = await db.query.fastPassPurchases.findFirst({
    where: eq(fastPassPurchases.id, purchaseId),
    columns: {
      accessTokenHash: true,
      accessTokenRevokedAt: true,
    },
  });

  if (!purchase) {
    return { granted: false, reason: "not_found" };
  }

  return resolvePurchaseAccessFromSubject(purchase, token);
}
