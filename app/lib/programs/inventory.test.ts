import { describe, expect, it } from "vitest";

import type { SessionPurchaseStatus } from "@/app/lib/programs/definitions";
import {
  canReserve,
  isHoldingSeat,
  lockOrder,
  resolveAvailability,
} from "@/app/lib/programs/inventory";

const NOW = new Date("2026-08-01T12:00:00.000Z");
const FUTURE = new Date("2026-08-01T12:20:00.000Z");
const PAST = new Date("2026-08-01T11:40:00.000Z");

describe("isHoldingSeat", () => {
  it("holds while awaiting review, with no expiry", () => {
    for (const status of [
      "under_verification",
      "changes_requested",
    ] as SessionPurchaseStatus[]) {
      expect(isHoldingSeat({ status, holdExpiresAt: PAST }, NOW)).toBe(true);
    }
  });

  it("holds a pending upload only until its deadline", () => {
    expect(
      isHoldingSeat({ status: "pending_upload", holdExpiresAt: FUTURE }, NOW),
    ).toBe(true);
    expect(
      isHoldingSeat({ status: "pending_upload", holdExpiresAt: PAST }, NOW),
    ).toBe(false);
  });

  it("releases exactly at the deadline", () => {
    expect(
      isHoldingSeat({ status: "pending_upload", holdExpiresAt: NOW }, NOW),
    ).toBe(false);
  });

  it("does not count an approved purchase, which holds through its tickets", () => {
    expect(
      isHoldingSeat({ status: "approved", holdExpiresAt: FUTURE }, NOW),
    ).toBe(false);
  });

  it("does not count terminal states", () => {
    for (const status of [
      "expired",
      "rejected",
      "cancelled",
    ] as SessionPurchaseStatus[]) {
      expect(isHoldingSeat({ status, holdExpiresAt: FUTURE }, NOW)).toBe(false);
    }
  });
});

describe("resolveAvailability", () => {
  it("counts tickets and holds together", () => {
    const availability = resolveAvailability({
      capacity: 20,
      validTickets: 12,
      activeHolds: 3,
    });

    expect(availability.occupied).toBe(15);
    expect(availability.remaining).toBe(5);
    expect(availability.isSoldOut).toBe(false);
  });

  it("reports sold out at exactly zero remaining", () => {
    const availability = resolveAvailability({
      capacity: 5,
      validTickets: 5,
      activeHolds: 0,
    });

    expect(availability.remaining).toBe(0);
    expect(availability.isSoldOut).toBe(true);
  });

  it("floors at zero when capacity is lowered below what is sold", () => {
    const availability = resolveAvailability({
      capacity: 5,
      validTickets: 8,
      activeHolds: 0,
    });

    expect(availability.occupied).toBe(8);
    expect(availability.remaining).toBe(0);
    expect(availability.isSoldOut).toBe(true);
  });
});

describe("canReserve", () => {
  const oneLeft = resolveAvailability({
    capacity: 10,
    validTickets: 9,
    activeHolds: 0,
  });
  const soldOut = resolveAvailability({
    capacity: 10,
    validTickets: 10,
    activeHolds: 0,
  });

  it("allows a seat while one remains", () => {
    expect(canReserve(oneLeft)).toBe(true);
    expect(canReserve(oneLeft, 2)).toBe(false);
  });

  it("refuses when sold out", () => {
    expect(canReserve(soldOut)).toBe(false);
  });

  it("lets a waitlist invitation cover exactly one seat past sold out", () => {
    expect(canReserve(soldOut, 1, { waitlistInvitationCoversSeat: true })).toBe(
      true,
    );
    expect(canReserve(soldOut, 2, { waitlistInvitationCoversSeat: true })).toBe(
      false,
    );
  });

  it("refuses a non-positive request", () => {
    expect(canReserve(oneLeft, 0)).toBe(false);
    expect(canReserve(oneLeft, -1)).toBe(false);
  });
});

describe("lockOrder", () => {
  it("sorts ascending so concurrent purchases cannot deadlock", () => {
    expect(lockOrder([9, 2, 5])).toEqual([2, 5, 9]);
  });

  it("deduplicates, since one purchase takes at most one seat per occurrence", () => {
    expect(lockOrder([4, 4, 1])).toEqual([1, 4]);
  });

  it("handles an empty list", () => {
    expect(lockOrder([])).toEqual([]);
  });
});
