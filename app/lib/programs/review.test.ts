import { describe, expect, it } from "vitest";

import {
  REVIEW_DECISION_STATUS,
  resolveReviewDecision,
  type ReviewSubject,
} from "@/app/lib/programs/review";

function subject(overrides: Partial<ReviewSubject> = {}): ReviewSubject {
  return {
    paymentMode: "bank_qr",
    status: "under_verification",
    voucherCount: 1,
    ...overrides,
  };
}

const DECISIONS = ["approve", "reject", "request_changes"] as const;

describe("resolveReviewDecision", () => {
  it.each(DECISIONS)("allows %s on a purchase under verification", (d) => {
    expect(resolveReviewDecision(subject(), d)).toEqual({ allowed: true });
  });

  it.each(DECISIONS)("allows %s after changes were requested", (d) => {
    // The team can decide on the voucher they already hold rather than waiting
    // for another upload.
    expect(
      resolveReviewDecision(subject({ status: "changes_requested" }), d),
    ).toEqual({ allowed: true });
  });

  it("refuses a free purchase", () => {
    expect(
      resolveReviewDecision(
        subject({ paymentMode: "free", status: "approved" }),
        "approve",
      ),
    ).toEqual({ allowed: false, blocker: "not_payable" });
  });

  it.each(["approved", "rejected", "expired", "cancelled"] as const)(
    "refuses a decision on a %s purchase",
    (status) => {
      expect(resolveReviewDecision(subject({ status }), "approve")).toEqual({
        allowed: false,
        blocker: "already_resolved",
      });
    },
  );

  it("refuses before a voucher exists", () => {
    expect(
      resolveReviewDecision(subject({ status: "pending_upload" }), "approve"),
    ).toEqual({ allowed: false, blocker: "not_reviewable" });
  });

  it("refuses when the status is reviewable but no voucher is on file", () => {
    expect(
      resolveReviewDecision(subject({ voucherCount: 0 }), "approve"),
    ).toEqual({ allowed: false, blocker: "no_voucher" });
  });

  it("reports already-resolved before not-reviewable on a double click", () => {
    expect(
      resolveReviewDecision(
        subject({ status: "approved", voucherCount: 0 }),
        "approve",
      ),
    ).toEqual({ allowed: false, blocker: "already_resolved" });
  });
});

describe("REVIEW_DECISION_STATUS", () => {
  it("maps each decision to its resulting status", () => {
    expect(REVIEW_DECISION_STATUS).toEqual({
      approve: "approved",
      reject: "rejected",
      request_changes: "changes_requested",
    });
  });
});
