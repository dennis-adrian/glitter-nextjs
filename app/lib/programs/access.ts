/**
 * Who may open a purchase.
 *
 * Two credentials, never "is signed in" on its own: either the viewer *is* the
 * buyer, or they present the secure token. A signed-in stranger has no more
 * access than an anonymous one.
 *
 * See docs/ARCHITECTURE-paid-programs-and-sessions.md §11.1.
 */

export type PurchaseAccessSubject = {
  userId: number | null;
  accessTokenHash: string;
  accessTokenRevokedAt: Date | null;
};

export type PurchaseAccessInput = {
  purchase: PurchaseAccessSubject;
  viewerUserId: number | null;
  /** Already hashed by the caller — this module stays free of server-only code. */
  presentedTokenHash: string | null;
};

export type PurchaseAccessDenial =
  | "no_credentials"
  | "token_revoked"
  | "token_mismatch";

export type PurchaseAccess =
  | { granted: true; via: "owner" | "token" }
  | { granted: false; reason: PurchaseAccessDenial };

/**
 * Length-independent equality, so comparing a presented digest cannot become a
 * timing oracle. Both inputs are hex digests of the same length in practice;
 * the length check short-circuits only obviously wrong input.
 */
export function digestsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let difference = 0;
  for (let index = 0; index < a.length; index++) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }

  return difference === 0;
}

export function resolvePurchaseAccess(
  input: PurchaseAccessInput,
): PurchaseAccess {
  const { purchase, viewerUserId, presentedTokenHash } = input;

  // Ownership first: a signed-in buyer reaches their purchase from their
  // profile, with no token in the URL at all.
  if (
    purchase.userId !== null &&
    viewerUserId !== null &&
    purchase.userId === viewerUserId
  ) {
    return { granted: true, via: "owner" };
  }

  if (presentedTokenHash === null) {
    return { granted: false, reason: "no_credentials" };
  }

  // Revocation is checked before the comparison, so a revoked link fails even
  // when the token is otherwise correct.
  if (purchase.accessTokenRevokedAt !== null) {
    return { granted: false, reason: "token_revoked" };
  }

  if (digestsMatch(presentedTokenHash, purchase.accessTokenHash)) {
    return { granted: true, via: "token" };
  }

  return { granted: false, reason: "token_mismatch" };
}
