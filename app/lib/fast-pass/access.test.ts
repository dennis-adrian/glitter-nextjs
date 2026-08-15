import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: {} }));

import { resolvePurchaseAccessFromSubject } from "@/app/lib/fast-pass/access";
import { hashAccessToken } from "@/app/lib/fast-pass/tokens";
import { validateOperatorForSettings } from "@/app/lib/fast-pass/pos-access";

describe("FastPass scoped access", () => {
  it("grants only the matching buyer bearer token", () => {
    const token = "buyer-secret";
    const purchase = {
      accessTokenHash: hashAccessToken(token),
      accessTokenRevokedAt: null,
    };
    expect(resolvePurchaseAccessFromSubject(purchase, token)).toEqual({
      granted: true,
    });
    expect(resolvePurchaseAccessFromSubject(purchase, "wrong").granted).toBe(
      false,
    );
  });

  it("denies a revoked buyer link", () => {
    const token = "buyer-secret";
    expect(
      resolvePurchaseAccessFromSubject(
        {
          accessTokenHash: hashAccessToken(token),
          accessTokenRevokedAt: new Date(),
        },
        token,
      ).granted,
    ).toBe(false);
  });

  it("scopes POS operators to one day settings record", () => {
    expect(validateOperatorForSettings({ settingsId: 7 }, 7)).toBe(true);
    expect(validateOperatorForSettings({ settingsId: 7 }, 8)).toBe(false);
  });
});
