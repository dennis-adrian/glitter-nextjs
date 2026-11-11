// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  classifyPushError,
  classifyPushResponse,
  parseRetryAfter,
  pushErrorReason,
} from "@/app/lib/notifications/push/result";

/** The shape `web-push` rejects with for a non-2xx answer. */
function webPushError(
  statusCode: number,
  headers: Record<string, string> = {},
  body: unknown = "endpoint-echoing body",
) {
  return Object.assign(new Error("Received unexpected response code"), {
    name: "WebPushError",
    statusCode,
    headers,
    body,
    endpoint: "https://fcm.googleapis.com/fcm/send/secret",
  });
}

const APPLE_ENDPOINT = "https://web.push.apple.com/QGx-secret-token";

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

  it("keeps Apple's reason next to the status", () => {
    expect(
      classifyPushError(
        webPushError(400, {}, '{"reason":"BadDeviceToken"}'),
        NOW,
      ),
    ).toEqual({ kind: "failed", error: "push_400:BadDeviceToken" });
    expect(
      classifyPushError(webPushError(403, {}, '{"reason":"BadJwtToken"}'), NOW),
    ).toEqual({ kind: "failed", error: "push_403:BadJwtToken" });
  });

  it("classifies by the status alone, whatever the reason says", () => {
    expect(
      classifyPushError(
        webPushError(410, {}, '{"reason":"Unregistered"}'),
        NOW,
      ),
    ).toEqual({ kind: "gone", error: "push_410:Unregistered" });
    expect(
      classifyPushError(
        webPushError(
          429,
          { "retry-after": "60" },
          '{"reason":"TooManyRequests"}',
        ),
        NOW,
      ),
    ).toEqual({
      kind: "retry",
      error: "push_429:TooManyRequests",
      retryAfterMs: 60_000,
    });
    expect(
      classifyPushError(
        webPushError(503, {}, '{"reason":"ServiceUnavailable"}'),
        NOW,
      ),
    ).toEqual({
      kind: "retry",
      error: "push_503:ServiceUnavailable",
      retryAfterMs: null,
    });
    // A reason that sounds harmless does not turn a failure into a success.
    expect(
      classifyPushError(webPushError(400, {}, '{"reason":"Success"}'), NOW)
        .kind,
    ).toBe("failed");
  });

  it("drops a reason that echoes a URL or anything that is not a word", () => {
    for (const body of [
      JSON.stringify({ reason: APPLE_ENDPOINT }),
      JSON.stringify({ reason: `BadDeviceToken ${APPLE_ENDPOINT}` }),
      JSON.stringify({ reason: "Bad_Device-Token" }),
      JSON.stringify({ reason: "A".repeat(41) }),
      JSON.stringify({ reason: "" }),
      JSON.stringify({ reason: ["BadDeviceToken"] }),
      JSON.stringify({ reason: { code: "BadDeviceToken" } }),
      JSON.stringify({ error: "BadDeviceToken", endpoint: APPLE_ENDPOINT }),
    ]) {
      const outcome = classifyPushError(webPushError(400, {}, body), NOW);
      expect(outcome).toEqual({ kind: "failed", error: "push_400" });
      expect(JSON.stringify(outcome)).not.toContain("secret");
    }
  });

  it("ignores a body that is not JSON, or not there", () => {
    for (const body of [
      `Not Found: ${APPLE_ENDPOINT}`,
      "<html>Bad Request</html>",
      '{"reason":"BadDeviceToken"',
      '"BadDeviceToken"',
      '["BadDeviceToken"]',
      "",
      undefined,
      null,
      42,
    ]) {
      expect(classifyPushError(webPushError(400, {}, body), NOW)).toEqual({
        kind: "failed",
        error: "push_400",
      });
    }
  });

  it("never records the endpoint or the response body", () => {
    const outcome = JSON.stringify(classifyPushError(webPushError(400), NOW));
    expect(outcome).not.toContain("secret");
    expect(outcome).not.toContain("body");
  });
});

describe("pushErrorReason", () => {
  it("reads a reason from a string or a raw body", () => {
    expect(pushErrorReason('{"reason":"BadTopic"}')).toBe("BadTopic");
    expect(
      pushErrorReason(new TextEncoder().encode('{"reason":"BadTopic"}')),
    ).toBe("BadTopic");
  });

  it("does not parse a body far longer than any reason", () => {
    const padded = JSON.stringify({
      reason: "BadDeviceToken",
      padding: "x".repeat(2000),
    });
    expect(pushErrorReason(padded)).toBeNull();
  });
});

describe("parseRetryAfter", () => {
  it("never asks for a wait in the past, and ignores nonsense", () => {
    expect(parseRetryAfter("Wed, 21 Oct 2026 11:00:00 GMT", NOW)).toBe(0);
    expect(parseRetryAfter("soon", NOW)).toBeNull();
    expect(parseRetryAfter(null, NOW)).toBeNull();
  });
});
