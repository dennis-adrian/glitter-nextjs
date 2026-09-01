import { describe, expect, it } from "vitest";

import {
  authorizeStandStatusPoll,
  buildStandStatusPollResult,
  isNewerPollVersion,
  mergePolledStandStatuses,
  nextPollBackoffMs,
} from "@/app/lib/stands/status-poll";

describe("authorizeStandStatusPoll", () => {
  it("rejects missing actors", () => {
    expect(
      authorizeStandStatusPoll({ actor: null, enrolled: true }),
    ).toBe("unauthenticated");
  });

  it("allows admins without enrollment", () => {
    expect(
      authorizeStandStatusPoll({
        actor: { id: 1, role: "admin", status: "pending" },
        enrolled: false,
      }),
    ).toBe("ok");
    expect(
      authorizeStandStatusPoll({
        actor: { id: 2, role: "festival_admin", status: "verified" },
        enrolled: false,
      }),
    ).toBe("ok");
  });

  it("requires a verified enrolled participant", () => {
    expect(
      authorizeStandStatusPoll({
        actor: { id: 3, role: "user", status: "pending" },
        enrolled: true,
      }),
    ).toBe("forbidden");
    expect(
      authorizeStandStatusPoll({
        actor: { id: 3, role: "user", status: "verified" },
        enrolled: false,
      }),
    ).toBe("forbidden");
    expect(
      authorizeStandStatusPoll({
        actor: { id: 3, role: "user", status: "verified" },
        enrolled: true,
      }),
    ).toBe("ok");
  });
});

describe("buildStandStatusPollResult", () => {
  it("returns minimal fields with effective status and availability", () => {
    const result = buildStandStatusPollResult({
      stands: [
        {
          standId: 10,
          storedStatus: "held",
          updatedAt: new Date("2026-08-31T12:00:00.000Z"),
        },
        {
          standId: 11,
          storedStatus: "available",
          updatedAt: null,
        },
      ],
      activeHoldStandIds: new Set(),
      version: 100,
    });

    expect(result).toEqual({
      availableCount: 2,
      version: 100,
      stands: [
        {
          standId: 10,
          effectiveStatus: "available",
          updatedAt: "2026-08-31T12:00:00.000Z",
        },
        {
          standId: 11,
          effectiveStatus: "available",
          updatedAt: null,
        },
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(/email|clerkId|phoneNumber/);
  });
});

describe("mergePolledStandStatuses", () => {
  it("updates only stands whose effective status changed", () => {
    const prev = [
      { id: 1, effectiveStatus: "available", status: "available", label: "A" },
      { id: 2, effectiveStatus: "available", status: "available", label: "B" },
    ];
    const merged = mergePolledStandStatuses(prev, [
      { standId: 2, effectiveStatus: "held", updatedAt: null },
    ]);
    expect(merged[0]).toBe(prev[0]);
    expect(merged[1]).toMatchObject({
      id: 2,
      effectiveStatus: "held",
      status: "held",
      label: "B",
    });
  });
});

describe("poll versioning and backoff", () => {
  it("ignores older versions", () => {
    expect(isNewerPollVersion(5, 5)).toBe(false);
    expect(isNewerPollVersion(4, 5)).toBe(false);
    expect(isNewerPollVersion(6, 5)).toBe(true);
  });

  it("doubles delay after failures up to the cap", () => {
    expect(nextPollBackoffMs(1, 4000)).toBe(4000);
    expect(nextPollBackoffMs(2, 4000)).toBe(8000);
    expect(nextPollBackoffMs(3, 4000)).toBe(16000);
    expect(nextPollBackoffMs(8, 4000)).toBe(30_000);
  });
});
