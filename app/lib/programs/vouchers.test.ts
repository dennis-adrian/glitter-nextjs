import { describe, expect, it } from "vitest";

import {
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
