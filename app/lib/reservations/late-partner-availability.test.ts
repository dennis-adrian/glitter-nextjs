import { describe, expect, it } from "vitest";

import { latePartnerBlockReason } from "@/app/lib/reservations/late-partner-availability";

const NOW = new Date("2026-09-05T12:00:00.000Z");
const DEADLINE = new Date("2026-09-20T12:00:00.000Z");

function input(overrides: Record<string, unknown> = {}) {
  return {
    isOwner: true,
    standCategory: "illustration",
    reservationStatus: "pending",
    registeredParticipantCount: 1,
    effectiveDeadlineAt: DEADLINE,
    now: NOW,
    ...overrides,
  } as Parameters<typeof latePartnerBlockReason>[0];
}

describe("latePartnerBlockReason", () => {
  it("allows an illustration owner alone on a live reservation", () => {
    expect(latePartnerBlockReason(input())).toBeNull();
  });

  it("refuses a partner trying to add a third person", () => {
    expect(latePartnerBlockReason(input({ isOwner: false }))).toBe("not_owner");
  });

  it("refuses categories that do not share a stand", () => {
    for (const standCategory of ["entrepreneurship", "gastronomy"]) {
      expect(latePartnerBlockReason(input({ standCategory }))).toBe(
        "not_illustration",
      );
    }
  });

  /**
   * "Live" is occupancy, not "unpaid". A partner may join a reservation that
   * is already paid for — that is exactly why the shared-price difference is
   * charged in credits instead of by repricing the original invoice.
   */
  it("allows every live status, including a paid one", () => {
    for (const reservationStatus of [
      "pending",
      "verification_payment",
      "accepted",
    ]) {
      expect(
        latePartnerBlockReason(input({ reservationStatus })),
        reservationStatus,
      ).toBeNull();
    }
  });

  it("refuses a reservation that has ended", () => {
    for (const reservationStatus of ["rejected", "released", "cancelled"]) {
      expect(
        latePartnerBlockReason(input({ reservationStatus })),
        reservationStatus,
      ).toBe("not_live");
    }
  });

  it("refuses a reservation that already has two people", () => {
    expect(
      latePartnerBlockReason(input({ registeredParticipantCount: 2 })),
    ).toBe("already_shared");
  });

  it("refuses once the deadline has passed", () => {
    expect(
      latePartnerBlockReason(
        input({ now: new Date(DEADLINE.getTime() + 1000) }),
      ),
    ).toBe("deadline_passed");
  });

  /** At the deadline, not merely after it. */
  it("refuses exactly at the deadline", () => {
    expect(latePartnerBlockReason(input({ now: DEADLINE }))).toBe(
      "deadline_passed",
    );
  });

  /**
   * An open-ended deadline would let somebody add a partner the night before
   * the doors open, which is what the lead time exists to prevent.
   */
  it("refuses when the festival has no deadline to compute", () => {
    expect(latePartnerBlockReason(input({ effectiveDeadlineAt: null }))).toBe(
      "no_deadline",
    );
  });

  /** Ownership is checked before anything else a stranger could probe. */
  it("reports the ownership failure first", () => {
    expect(
      latePartnerBlockReason(
        input({
          isOwner: false,
          standCategory: "gastronomy",
          reservationStatus: "rejected",
          effectiveDeadlineAt: null,
        }),
      ),
    ).toBe("not_owner");
  });
});
