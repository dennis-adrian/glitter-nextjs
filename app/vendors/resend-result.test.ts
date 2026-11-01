import type { ErrorResponse } from "resend";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assertSent,
  EmailSendError,
  getSendError,
  retryAfterMs,
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

describe("retryAfterMs", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ["120", 120_000],
    ["0", 0],
    [" 2 ", 2_000],
    ["1.5", 1_500],
    // Rounded up: never sooner than asked.
    ["0.0001", 1],
  ])("reads %j seconds as %i ms", (value, expected) => {
    expect(retryAfterMs({ "retry-after": value })).toBe(expected);
  });

  it("reads an HTTP date as the time left until it, and a past one as 0", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-25T12:00:00Z"));

    expect(
      retryAfterMs({ "retry-after": "Sun, 25 Oct 2026 12:00:30 GMT" }),
    ).toBe(30_000);
    expect(
      retryAfterMs({ "retry-after": "Sun, 25 Oct 2026 11:00:00 GMT" }),
    ).toBe(0);
  });

  it.each(["soon", "soon 5", "-1", "1e3", "", "Infinity", "2026-10-25"])(
    "reads %j as no wait at all",
    (value) => {
      expect(retryAfterMs({ "retry-after": value })).toBeNull();
    },
  );

  it("reads the header in any casing, from a plain object or Headers", () => {
    expect(retryAfterMs({ "Retry-After": "3" })).toBe(3_000);
    expect(retryAfterMs(new Headers({ "Retry-After": "4" }))).toBe(4_000);
  });

  it("is null without the header or without headers", () => {
    expect(retryAfterMs({ "content-type": "application/json" })).toBeNull();
    expect(retryAfterMs(new Headers())).toBeNull();
    expect(retryAfterMs({})).toBeNull();
    expect(retryAfterMs(null)).toBeNull();
    expect(retryAfterMs(undefined)).toBeNull();
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
      retryAfterMs: null,
    });
  });

  it("carries the reply's Retry-After for the caller's own retry", () => {
    expect(() =>
      assertSent({
        ...rejected("rate_limit_exceeded", 429),
        headers: { "retry-after": "3", "content-type": "application/json" },
      }),
    ).toThrow(
      expect.objectContaining({
        code: "rate_limit_exceeded",
        retryAfterMs: 3_000,
      }),
    );
    expect(() =>
      assertSent({ ...rejected("application_error", 500), headers: null }),
    ).toThrow(expect.objectContaining({ retryAfterMs: null }));
  });

  it("does not throw for an accepted send", () => {
    expect(() =>
      assertSent({ data: { id: "email-1" }, error: null, headers: {} }),
    ).not.toThrow();
  });
});
