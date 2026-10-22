// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  classifyPushError,
  classifyPushResponse,
  parseRetryAfter,
} from "@/app/lib/notifications/push/result";

/** The shape `web-push` rejects with for a non-2xx answer. */
function webPushError(
  statusCode: number,
  headers: Record<string, string> = {},
) {
  return Object.assign(new Error("Received unexpected response code"), {
    name: "WebPushError",
    statusCode,
    headers,
    body: "endpoint-echoing body",
    endpoint: "https://fcm.googleapis.com/fcm/send/secret",
  });
}

const NOW = new Date("2026-10-21T12:00:00Z");

describe("classifyPushResponse", () => {
  it("keeps Apple's message id, or the Location others answer with", () => {
    expect(
      classifyPushResponse({
        statusCode: 201,
        headers: { "apns-id": "A1B2", location: "https://x/1" },
      }),
    ).toEqual({ kind: "sent", providerMessageId: "A1B2" });
    expect(
      classifyPushResponse({
        statusCode: 201,
        headers: { location: "https://fcm.googleapis.com/m/1" },
      }),
    ).toEqual({
      kind: "sent",
      providerMessageId: "https://fcm.googleapis.com/m/1",
    });
    expect(classifyPushResponse({ statusCode: 201 })).toEqual({
      kind: "sent",
      providerMessageId: null,
    });
  });
});

describe("classifyPushError", () => {
  it.each([404, 410])("reads %i as a device that is gone", (status) => {
    expect(classifyPushError(webPushError(status), NOW)).toEqual({
      kind: "gone",
      error: `push_${status}`,
    });
  });

  it("retries a throttle when the service asks, in seconds or as a date", () => {
    expect(
      classifyPushError(webPushError(429, { "retry-after": "120" }), NOW),
    ).toEqual({ kind: "retry", error: "push_429", retryAfterMs: 120_000 });
    expect(
      classifyPushError(
        webPushError(429, { "retry-after": "Wed, 21 Oct 2026 12:05:00 GMT" }),
        NOW,
      ),
    ).toEqual({ kind: "retry", error: "push_429", retryAfterMs: 300_000 });
  });

  it.each([500, 502, 503, 408])("retries %i with backoff", (status) => {
    expect(classifyPushError(webPushError(status), NOW)).toEqual({
      kind: "retry",
      error: `push_${status}`,
      retryAfterMs: null,
    });
  });

  it.each([400, 401, 403, 413])(
    "fails %i for good: the request itself is wrong",
    (status) => {
      expect(classifyPushError(webPushError(status), NOW)).toEqual({
        kind: "failed",
        error: `push_${status}`,
      });
    },
  );

  it("retries when no answer came at all", () => {
    expect(classifyPushError(new Error("Socket timeout"), NOW)).toEqual({
      kind: "retry",
      error: "push_timeout",
      retryAfterMs: null,
    });
    expect(classifyPushError(new Error("ECONNRESET"), NOW)).toEqual({
      kind: "retry",
      error: "push_network",
      retryAfterMs: null,
    });
  });

  it("never records the endpoint or the response body", () => {
    const outcome = JSON.stringify(classifyPushError(webPushError(400), NOW));
    expect(outcome).not.toContain("secret");
    expect(outcome).not.toContain("body");
  });
});

describe("parseRetryAfter", () => {
  it("never asks for a wait in the past, and ignores nonsense", () => {
    expect(parseRetryAfter("Wed, 21 Oct 2026 11:00:00 GMT", NOW)).toBe(0);
    expect(parseRetryAfter("soon", NOW)).toBeNull();
    expect(parseRetryAfter(null, NOW)).toBeNull();
  });
});
