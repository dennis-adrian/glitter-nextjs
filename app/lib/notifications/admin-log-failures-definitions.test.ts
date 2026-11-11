import { describe, expect, it } from "vitest";

import {
  detectFailurePatterns,
  FAILURE_PATTERN_MIN_RECIPIENTS,
  FAILURE_PATTERN_WINDOW_MINUTES,
  type FailurePoint,
  failureListHref,
  failurePatternHint,
} from "@/app/lib/notifications/admin-log-failures-definitions";

const T0 = new Date("2026-11-10T14:00:00Z").getTime();

function point(
  recipient: string,
  minutes: number,
  overrides: Partial<FailurePoint> = {},
): FailurePoint {
  return {
    channel: "push",
    error: "push_403",
    platform: "fcm",
    recipient,
    firstAt: new Date(T0 + minutes * 60_000),
    failures: 1,
    ...overrides,
  };
}

function devices(count: number, spacingMinutes = 1) {
  return Array.from({ length: count }, (_, index) =>
    point(`device:${index}`, index * spacingMinutes),
  );
}

describe("detectFailurePatterns", () => {
  it("states the threshold it uses", () => {
    expect(FAILURE_PATTERN_MIN_RECIPIENTS).toBe(5);
    expect(FAILURE_PATTERN_WINDOW_MINUTES).toBe(60);
  });

  it("flags five devices failing the same way within the hour", () => {
    const [pattern, ...rest] = detectFailurePatterns(devices(5));
    expect(rest).toEqual([]);
    expect(pattern).toEqual({
      channel: "push",
      error: "push_403",
      platform: "fcm",
      recipients: 5,
      failures: 5,
      from: new Date(T0),
      to: new Date(T0 + 4 * 60_000),
    });
  });

  it("stays quiet at four", () => {
    expect(detectFailurePatterns(devices(4))).toEqual([]);
  });

  it("never fires on one device, however often it fails", () => {
    expect(
      detectFailurePatterns([
        point("device:1", 0, { failures: 40 }),
        point("device:1", 5, { failures: 40 }),
      ]),
    ).toEqual([]);
  });

  it("needs the five within one window, not spread over the day", () => {
    // One every 20 minutes: at most four fit in any 60 minutes.
    expect(detectFailurePatterns(devices(8, 20))).toEqual([]);
    // Exactly 60 minutes from first to last still counts.
    expect(detectFailurePatterns(devices(5, 15))).toHaveLength(1);
  });

  it("keeps errors, channels and push services apart", () => {
    const mixed = [
      point("device:1", 0),
      point("device:2", 1),
      point("device:3", 2, { error: "push_400" }),
      point("device:4", 3, { platform: "apple" }),
      point("email:a", 4, { channel: "email", platform: null }),
    ];
    expect(detectFailurePatterns(mixed)).toEqual([]);
  });

  it("finds an email pattern and lists the biggest first", () => {
    const emails = Array.from({ length: 6 }, (_, index) =>
      point(`email:${index}`, index, {
        channel: "email",
        platform: null,
        error: "resend:validation_error",
      }),
    );
    const patterns = detectFailurePatterns([...devices(5), ...emails]);
    expect(patterns.map((pattern) => pattern.channel)).toEqual([
      "email",
      "push",
    ]);
  });
});

describe("failureListHref", () => {
  it("links to the channel's failures over the Bolivian days the 24 hours touch", () => {
    // 01:00 UTC on the 11th is 21:00 on the 10th in La Paz.
    const href = failureListHref("push", new Date("2026-11-11T01:00:00Z"));
    const url = new URL(href, "https://example.test");
    expect(url.pathname).toBe("/dashboard/notifications");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      channel: "push",
      status: "failed",
      from: "2026-11-09",
      to: "2026-11-10",
    });
  });
});

describe("failurePatternHint", () => {
  it("points a push 4xx at the VAPID keys or the payload", () => {
    const [pattern] = detectFailurePatterns(devices(5));
    expect(failurePatternHint(pattern!)).toMatch(/VAPID/);
  });
});
