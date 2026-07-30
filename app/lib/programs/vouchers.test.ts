import { describe, expect, it } from "vitest";

import {
  acceptsVouchers,
  isAuthorizedVoucherUrl,
  resolveVoucherSubmission,
  type VoucherSubmissionSubject,
} from "@/app/lib/programs/vouchers";

const NOW = new Date("2026-08-01T12:00:00.000Z");
const LIVE_HOLD = new Date("2026-08-01T12:15:00.000Z");
const DEAD_HOLD = new Date("2026-08-01T11:45:00.000Z");

function subject(
  overrides: Partial<VoucherSubmissionSubject> = {},
): VoucherSubmissionSubject {
  return {
    paymentMode: "bank_qr",
    status: "pending_upload",
    holdExpiresAt: LIVE_HOLD,
    ...overrides,
  };
}

describe("resolveVoucherSubmission", () => {
  it("accepts a first upload inside the hold", () => {
    expect(resolveVoucherSubmission(subject(), NOW)).toEqual({ allowed: true });
  });

  it("refuses a free purchase — there is nothing to pay", () => {
    expect(
      resolveVoucherSubmission(
        subject({ paymentMode: "free", holdExpiresAt: null }),
        NOW,
      ),
    ).toEqual({ allowed: false, blocker: "not_payable" });
  });

  it("refuses once approved, so a locked voucher cannot be swapped", () => {
    expect(
      resolveVoucherSubmission(subject({ status: "approved" }), NOW),
    ).toEqual({ allowed: false, blocker: "already_approved" });
  });

  it.each(["rejected", "expired", "cancelled"] as const)(
    "refuses a %s purchase",
    (status) => {
      expect(resolveVoucherSubmission(subject({ status }), NOW)).toEqual({
        allowed: false,
        blocker: "purchase_closed",
      });
    },
  );

  it("refuses when the hold has run out", () => {
    expect(
      resolveVoucherSubmission(subject({ holdExpiresAt: DEAD_HOLD }), NOW),
    ).toEqual({ allowed: false, blocker: "hold_expired" });
  });

  it("treats the exact deadline as expired", () => {
    expect(
      resolveVoucherSubmission(subject({ holdExpiresAt: NOW }), NOW),
    ).toEqual({ allowed: false, blocker: "hold_expired" });
  });

  it("refuses a pending purchase with no hold at all", () => {
    expect(
      resolveVoucherSubmission(subject({ holdExpiresAt: null }), NOW),
    ).toEqual({ allowed: false, blocker: "hold_expired" });
  });

  it("allows replacement during review, even past the original deadline", () => {
    // The review holds the seat now, not the timestamp — see `isHoldingSeat`.
    expect(
      resolveVoucherSubmission(
        subject({ status: "under_verification", holdExpiresAt: DEAD_HOLD }),
        NOW,
      ),
    ).toEqual({ allowed: true });
  });

  it("allows replacement after changes are requested", () => {
    expect(
      resolveVoucherSubmission(
        subject({ status: "changes_requested", holdExpiresAt: DEAD_HOLD }),
        NOW,
      ),
    ).toEqual({ allowed: true });
  });
});

describe("acceptsVouchers", () => {
  it.each([
    "pending_upload",
    "under_verification",
    "changes_requested",
  ] as const)("accepts a bank_qr purchase in %s", (status) => {
    expect(acceptsVouchers({ paymentMode: "bank_qr", status })).toBe(true);
  });

  it("ignores the hold, so an expired pending purchase still shows the step", () => {
    // The page relies on this: `resolveVoucherSubmission` would refuse, but the
    // buyer still needs to be told their reservation lapsed.
    expect(
      acceptsVouchers({ paymentMode: "bank_qr", status: "pending_upload" }),
    ).toBe(true);
  });

  it.each(["approved", "rejected", "expired", "cancelled"] as const)(
    "refuses a %s purchase",
    (status) => {
      expect(acceptsVouchers({ paymentMode: "bank_qr", status })).toBe(false);
    },
  );

  it("refuses a free purchase", () => {
    expect(
      acceptsVouchers({ paymentMode: "free", status: "pending_upload" }),
    ).toBe(false);
  });
});

describe("isAuthorizedVoucherUrl", () => {
  const KEY = "abc123XYZkey";

  it("accepts the per-app ufs.sh host", () => {
    expect(
      isAuthorizedVoucherUrl(`https://ja4q35y666.ufs.sh/f/${KEY}`, KEY),
    ).toBe(true);
  });

  it("accepts the legacy utfs.io host", () => {
    expect(isAuthorizedVoucherUrl(`https://utfs.io/f/${KEY}`, KEY)).toBe(true);
  });

  it("rejects an arbitrary host carrying the right key", () => {
    expect(isAuthorizedVoucherUrl(`https://evil.example/f/${KEY}`, KEY)).toBe(
      false,
    );
  });

  it("rejects a lookalike host that merely contains an allowed one", () => {
    expect(
      isAuthorizedVoucherUrl(`https://utfs.io.evil.com/f/${KEY}`, KEY),
    ).toBe(false);
  });

  it("rejects a key that is only a suffix of the final segment", () => {
    expect(isAuthorizedVoucherUrl(`https://utfs.io/f/other-${KEY}`, KEY)).toBe(
      false,
    );
  });

  it("rejects a mismatched key", () => {
    expect(
      isAuthorizedVoucherUrl(`https://utfs.io/f/${KEY}`, "different"),
    ).toBe(false);
  });

  it("rejects plain http", () => {
    expect(isAuthorizedVoucherUrl(`http://utfs.io/f/${KEY}`, KEY)).toBe(false);
  });

  it("rejects a non-URL and an empty key", () => {
    expect(isAuthorizedVoucherUrl("not a url", KEY)).toBe(false);
    expect(isAuthorizedVoucherUrl(`https://utfs.io/f/${KEY}`, "  ")).toBe(
      false,
    );
  });

  it("rejects the key appearing somewhere other than the last segment", () => {
    expect(
      isAuthorizedVoucherUrl(`https://utfs.io/f/${KEY}/evil.png`, KEY),
    ).toBe(false);
  });
});
