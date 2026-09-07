import { describe, expect, it } from "vitest";

import { LatestRequest } from "@/app/lib/reservations/latest-request";

describe("LatestRequest", () => {
  it("ignores a slower earlier request", () => {
    const tracker = new LatestRequest();
    const first = tracker.next();
    const second = tracker.next();
    expect(tracker.isCurrent(first)).toBe(false);
    expect(tracker.isCurrent(second)).toBe(true);
  });
});
