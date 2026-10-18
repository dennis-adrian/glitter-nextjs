import type { ErrorResponse } from "resend";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assertSent,
  EmailSendError,
  getSendError,
} from "@/app/vendors/resend-result";

function rejected(name: ErrorResponse["name"], statusCode: number) {
  return {
    data: null,
    error: { name, statusCode, message: `${name} from Resend` },
    headers: {},
  };
}

describe("getSendError", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads an accepted send as no error", () => {
    expect(
      getSendError({ data: { id: "email-1" }, error: null, headers: {} }),
    ).toBeNull();
  });

  it.each([
    ["validation_error", 422],
    ["rate_limit_exceeded", 429],
    ["daily_quota_exceeded", 429],
    ["application_error", 500],
    // The first request is still in flight and may yet fail.
    ["concurrent_idempotent_requests", 409],
  ] as const)("reports %s (%i) as a failure", (name, statusCode) => {
    expect(getSendError(rejected(name, statusCode))).toMatchObject({
      name,
      statusCode,
    });
  });

  it("counts a key already used with another body as sent", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(
      getSendError(rejected("invalid_idempotent_request", 409)),
    ).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
  });
});

describe("assertSent", () => {
  it("throws the Resend error name and status", () => {
    let thrown: unknown;
    try {
      assertSent(rejected("rate_limit_exceeded", 429));
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(EmailSendError);
    expect(thrown).toMatchObject({
      code: "rate_limit_exceeded",
      statusCode: 429,
      message: "rate_limit_exceeded: rate_limit_exceeded from Resend",
    });
  });

  it("does not throw for an accepted send", () => {
    expect(() =>
      assertSent({ data: { id: "email-1" }, error: null, headers: {} }),
    ).not.toThrow();
  });
});
