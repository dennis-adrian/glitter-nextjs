import { describe, expect, it } from "vitest";

import {
  digestsMatch,
  resolvePurchaseAccess,
  type PurchaseAccessSubject,
} from "@/app/lib/programs/access";

const HASH = "a".repeat(64);
const OTHER_HASH = "b".repeat(64);

function purchase(
  overrides: Partial<PurchaseAccessSubject> = {},
): PurchaseAccessSubject {
  return {
    userId: null,
    accessTokenHash: HASH,
    accessTokenRevokedAt: null,
    ...overrides,
  };
}

describe("digestsMatch", () => {
  it("matches identical digests and rejects everything else", () => {
    expect(digestsMatch(HASH, HASH)).toBe(true);
    expect(digestsMatch(HASH, OTHER_HASH)).toBe(false);
    expect(digestsMatch(HASH, HASH.slice(0, 60))).toBe(false);
    expect(digestsMatch("", "")).toBe(true);
  });

  it("rejects a digest that only shares a prefix", () => {
    expect(digestsMatch(HASH, "a".repeat(63) + "b")).toBe(false);
  });
});

describe("resolvePurchaseAccess", () => {
  it("grants the buyer access to their own purchase without a token", () => {
    expect(
      resolvePurchaseAccess({
        purchase: purchase({ userId: 7 }),
        viewerUserId: 7,
        presentedTokenHash: null,
      }),
    ).toEqual({ granted: true, via: "owner" });
  });

  it("grants access to a correct token", () => {
    expect(
      resolvePurchaseAccess({
        purchase: purchase(),
        viewerUserId: null,
        presentedTokenHash: HASH,
      }),
    ).toEqual({ granted: true, via: "token" });
  });

  it("refuses a signed-in stranger with no token", () => {
    expect(
      resolvePurchaseAccess({
        purchase: purchase({ userId: 7 }),
        viewerUserId: 99,
        presentedTokenHash: null,
      }),
    ).toEqual({ granted: false, reason: "no_credentials" });
  });

  it("refuses a guest purchase opened by a signed-in user with no token", () => {
    // A guest purchase has no owner, so being signed in grants nothing.
    expect(
      resolvePurchaseAccess({
        purchase: purchase({ userId: null }),
        viewerUserId: 7,
        presentedTokenHash: null,
      }),
    ).toEqual({ granted: false, reason: "no_credentials" });
  });

  it("refuses a wrong token", () => {
    expect(
      resolvePurchaseAccess({
        purchase: purchase(),
        viewerUserId: null,
        presentedTokenHash: OTHER_HASH,
      }),
    ).toEqual({ granted: false, reason: "token_mismatch" });
  });

  it("refuses a revoked token even when it is otherwise correct", () => {
    expect(
      resolvePurchaseAccess({
        purchase: purchase({ accessTokenRevokedAt: new Date() }),
        viewerUserId: null,
        presentedTokenHash: HASH,
      }),
    ).toEqual({ granted: false, reason: "token_revoked" });
  });

  it("still lets the owner in after their token is revoked", () => {
    // Revocation kills the link, not the buyer's own access from their profile.
    expect(
      resolvePurchaseAccess({
        purchase: purchase({ userId: 7, accessTokenRevokedAt: new Date() }),
        viewerUserId: 7,
        presentedTokenHash: null,
      }),
    ).toEqual({ granted: true, via: "owner" });
  });

  it("lets the buyer use their emailed link while signed out", () => {
    expect(
      resolvePurchaseAccess({
        purchase: purchase({ userId: 7 }),
        viewerUserId: null,
        presentedTokenHash: HASH,
      }),
    ).toEqual({ granted: true, via: "token" });
  });

  it("does not let another buyer's token open this purchase", () => {
    expect(
      resolvePurchaseAccess({
        purchase: purchase({ userId: 7 }),
        viewerUserId: 99,
        presentedTokenHash: OTHER_HASH,
      }),
    ).toEqual({ granted: false, reason: "token_mismatch" });
  });
});
