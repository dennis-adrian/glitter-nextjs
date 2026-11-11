// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isSuppressed: vi.fn(),
  buildEmailCopy: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/app/lib/emails/suppressions", () => ({
  isSuppressed: mocks.isSuppressed,
  emailKey: (address: string) => address.trim().toLowerCase(),
}));
vi.mock("@/app/lib/notifications/registry", () => ({
  buildEmailCopy: mocks.buildEmailCopy,
}));
vi.mock("@/app/lib/notifications/admin-log-queries", () => ({
  parseLogTimestamp: (value: unknown) => (value ? new Date(String(value)) : null),
}));

import { resendRefusal } from "@/app/lib/notifications/admin-resend";
import {
  isResendableDelivery,
  notificationResendKey,
} from "@/app/lib/notifications/admin-resend-definitions";

type Row = NonNullable<Parameters<typeof resendRefusal>[1]>;

function original(overrides: Partial<Row> = {}): Row {
  return {
    id: 7,
    channel: "email",
    lane: "transactional",
    status: "failed",
    template_key: "credit_gift_received",
    recipient_email: "Lola@Example.test ",
    payload: { amount: 10 },
    notification_id: 3,
    user_id: 12,
    account_email: "lola@example.test",
    account_exists: true,
    deleting: false,
    retracted: false,
    gift_revoked: false,
    ...overrides,
  };
}

const executor = {} as Parameters<typeof resendRefusal>[0];

beforeEach(() => {
  mocks.isSuppressed.mockReset().mockResolvedValue(false);
  mocks.buildEmailCopy.mockReset().mockReturnValue({ subject: "Hola" });
});

describe("resend eligibility", () => {
  it("lets a failed transactional email through", async () => {
    expect(await resendRefusal(executor, original(), null)).toBeNull();
    // The account's address matches whatever its case and spacing.
    expect(mocks.isSuppressed).toHaveBeenCalledWith(
      "Lola@Example.test ",
      executor,
    );
  });

  it("refuses a row that is gone", async () => {
    expect(await resendRefusal(executor, undefined, null)).toBe("NOT_FOUND");
  });

  it.each([
    ["a push", { channel: "push" }],
    ["a bulk email", { lane: "bulk" }],
    ["an email that was sent", { status: "sent" }],
    ["an email that was skipped", { status: "skipped" }],
    ["an email still pending", { status: "pending" }],
    ["an email with no address", { recipient_email: null }],
  ])("refuses %s as not eligible", async (_label, overrides) => {
    expect(await resendRefusal(executor, original(overrides), null)).toBe(
      "NOT_ELIGIBLE",
    );
  });

  it.each([
    ["pending", "RESEND_PENDING"],
    ["processing", "RESEND_PENDING"],
    ["sent", "RESEND_SENT"],
    ["failed", "RESEND_DONE"],
    ["skipped", "RESEND_DONE"],
  ])("refuses a row whose resend is %s", async (status, code) => {
    expect(await resendRefusal(executor, original(), status)).toBe(code);
  });

  it.each([
    ["no account on the row", { user_id: null }, "NO_ACCOUNT"],
    ["an account that is gone", { account_exists: false }, "NO_ACCOUNT"],
    ["an account being deleted", { deleting: true }, "DELETING"],
    [
      "an account that changed its address",
      { account_email: "nueva@example.test" },
      "EMAIL_CHANGED",
    ],
    ["a retracted inbox item", { retracted: true }, "RETRACTED"],
    ["a revoked gift", { gift_revoked: true }, "REVOKED"],
  ])("refuses %s", async (_label, overrides, code) => {
    expect(await resendRefusal(executor, original(overrides), null)).toBe(code);
    expect(mocks.buildEmailCopy).not.toHaveBeenCalled();
  });

  it("refuses a suppressed address", async () => {
    mocks.isSuppressed.mockResolvedValue(true);
    expect(await resendRefusal(executor, original(), null)).toBe("SUPPRESSED");
  });

  it("refuses a snapshot that no longer renders, from the stored payload", async () => {
    mocks.buildEmailCopy.mockReturnValue(null);
    expect(await resendRefusal(executor, original(), null)).toBe(
      "RENDER_UNAVAILABLE",
    );
    expect(mocks.buildEmailCopy).toHaveBeenCalledWith("credit_gift_received", {
      amount: 10,
    });
  });
});

describe("resend definitions", () => {
  it("offers only failed transactional delivery emails", () => {
    const base = {
      source: "delivery",
      channel: "email",
      lane: "transactional",
      status: "failed",
    };
    expect(isResendableDelivery(base)).toBe(true);
    expect(isResendableDelivery({ ...base, source: "reservation_outbox" })).toBe(
      false,
    );
    expect(isResendableDelivery({ ...base, lane: "bulk" })).toBe(false);
    expect(isResendableDelivery({ ...base, channel: "push" })).toBe(false);
    expect(isResendableDelivery({ ...base, status: "skipped" })).toBe(false);
  });

  it("keys a row's one resend by the row it resends", () => {
    expect(notificationResendKey(7)).toBe(
      "notification-delivery:7:admin-resend",
    );
  });
});
