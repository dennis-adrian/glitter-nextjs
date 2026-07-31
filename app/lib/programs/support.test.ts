import { describe, expect, it } from "vitest";

import { canCancelAsAdmin, canResend } from "@/app/lib/programs/support";

describe("canCancelAsAdmin", () => {
  it.each([
    "pending_upload",
    "under_verification",
    "changes_requested",
  ] as const)("allows cancelling an open purchase in %s", (status) => {
    expect(canCancelAsAdmin({ status })).toEqual({ allowed: true });
  });

  it("allows cancelling an approved purchase — the support case it exists for", () => {
    expect(canCancelAsAdmin({ status: "approved" })).toEqual({ allowed: true });
  });

  it.each(["rejected", "expired", "cancelled"] as const)(
    "refuses a %s purchase",
    (status) => {
      expect(canCancelAsAdmin({ status })).toEqual({
        allowed: false,
        blocker: "already_closed",
      });
    },
  );
});

describe("canResend", () => {
  it("allows a resend when there is somewhere to send", () => {
    expect(canResend(true)).toEqual({ allowed: true });
  });

  it("refuses without a recipient", () => {
    expect(canResend(false)).toEqual({
      allowed: false,
      blocker: "no_recipient",
    });
  });
});
