import { describe, expect, it } from "vitest";

import { resolveAvailability } from "@/app/lib/programs/inventory";
import type { SessionPurchaseStatus } from "@/app/lib/programs/definitions";
import {
  countCheckedIn,
  occupiesSeat,
  resolveRosterSeatState,
  summarizeRoster,
  type RosterSeatInput,
  type RosterSeatState,
} from "@/app/lib/programs/roster";

const NOW = new Date("2026-08-01T12:00:00.000Z");
const LIVE_HOLD = new Date("2026-08-01T12:15:00.000Z");
const LAPSED_HOLD = new Date("2026-08-01T11:45:00.000Z");

function seat(overrides: Partial<RosterSeatInput> = {}): RosterSeatInput {
  return {
    purchaseStatus: "pending_upload",
    ticketStatus: null,
    holdExpiresAt: LIVE_HOLD,
    ...overrides,
  };
}

describe("resolveRosterSeatState", () => {
  it("treats a valid ticket as confirmed whatever the purchase says", () => {
    expect(
      resolveRosterSeatState(
        seat({ purchaseStatus: "approved", ticketStatus: "valid" }),
        NOW,
      ),
    ).toBe("confirmed");
  });

  it("releases the seat when the ticket was cancelled", () => {
    // Support cancels the ticket to free the seat; the purchase row still says
    // `approved`, and the roster has to agree with the seat count, not the row.
    expect(
      resolveRosterSeatState(
        seat({ purchaseStatus: "approved", ticketStatus: "cancelled" }),
        NOW,
      ),
    ).toBe("released");
  });

  it("distinguishes the two review states", () => {
    expect(
      resolveRosterSeatState(
        seat({ purchaseStatus: "under_verification", holdExpiresAt: null }),
        NOW,
      ),
    ).toBe("awaiting_review");
    expect(
      resolveRosterSeatState(
        seat({ purchaseStatus: "changes_requested", holdExpiresAt: null }),
        NOW,
      ),
    ).toBe("changes_requested");
  });

  it("keeps a purchase under review even past its old deadline", () => {
    // Uploading a voucher stops the clock; the seat is held by the review.
    expect(
      resolveRosterSeatState(
        seat({
          purchaseStatus: "under_verification",
          holdExpiresAt: LAPSED_HOLD,
        }),
        NOW,
      ),
    ).toBe("awaiting_review");
  });

  it("holds only while the deadline is live", () => {
    expect(
      resolveRosterSeatState(seat({ holdExpiresAt: LIVE_HOLD }), NOW),
    ).toBe("holding");
    expect(
      resolveRosterSeatState(seat({ holdExpiresAt: LAPSED_HOLD }), NOW),
    ).toBe("released");
    // Exactly at the deadline the seat is gone: the query uses `>`, not `>=`.
    expect(resolveRosterSeatState(seat({ holdExpiresAt: NOW }), NOW)).toBe(
      "released",
    );
    expect(resolveRosterSeatState(seat({ holdExpiresAt: null }), NOW)).toBe(
      "released",
    );
  });

  it("releases every terminal purchase state", () => {
    for (const status of [
      "rejected",
      "expired",
      "cancelled",
    ] as SessionPurchaseStatus[]) {
      expect(
        resolveRosterSeatState(seat({ purchaseStatus: status }), NOW),
      ).toBe("released");
    }
  });
});

describe("summarizeRoster", () => {
  it("counts each state and sums occupancy", () => {
    const totals = summarizeRoster([
      "confirmed",
      "confirmed",
      "awaiting_review",
      "changes_requested",
      "holding",
      "released",
      "released",
    ]);

    expect(totals).toEqual({
      confirmed: 2,
      awaitingReview: 1,
      changesRequested: 1,
      holding: 1,
      released: 2,
      occupied: 5,
      needsAction: 2,
    });
  });

  it("is empty for an occurrence nobody has touched", () => {
    expect(summarizeRoster([])).toEqual({
      confirmed: 0,
      awaitingReview: 0,
      changesRequested: 0,
      holding: 0,
      released: 0,
      occupied: 0,
      needsAction: 0,
    });
  });
});

describe("countCheckedIn", () => {
  const AT = new Date("2026-08-01T13:00:00.000Z");

  it("counts arrivals on confirmed seats", () => {
    expect(
      countCheckedIn([
        { state: "confirmed", checkedInAt: AT },
        { state: "confirmed", checkedInAt: AT },
        { state: "confirmed", checkedInAt: null },
      ]),
    ).toBe(2);
  });

  it("ignores an attendance left behind by a cancelled ticket", () => {
    // The row keeps its time as history, but the seat was given back, so
    // counting it would print "2 de 1 ingresaron" next to the confirmed total.
    expect(
      countCheckedIn([
        { state: "confirmed", checkedInAt: AT },
        { state: "released", checkedInAt: AT },
      ]),
    ).toBe(1);
  });

  it("never exceeds the confirmed count it is displayed against", () => {
    const entries = [
      { state: "confirmed" as const, checkedInAt: AT },
      { state: "released" as const, checkedInAt: AT },
      { state: "holding" as const, checkedInAt: null },
      { state: "awaiting_review" as const, checkedInAt: AT },
    ];
    const totals = summarizeRoster(entries.map((entry) => entry.state));

    expect(countCheckedIn(entries)).toBeLessThanOrEqual(totals.confirmed);
  });

  it("is zero for an occurrence nobody has arrived at", () => {
    expect(countCheckedIn([])).toBe(0);
    expect(countCheckedIn([{ state: "confirmed", checkedInAt: null }])).toBe(0);
  });
});

describe("roster occupancy reconciles with resolveAvailability", () => {
  /**
   * The point of the whole module. The dashboard shows a roster and a
   * "X de Y cupos" count side by side; if they are computed from different
   * rules they will disagree in front of an admin, and the seat count is the
   * one people act on. This pins them together.
   */
  const cases: { label: string; seats: RosterSeatInput[]; capacity: number }[] =
    [
      {
        label: "a full occurrence of confirmed tickets",
        capacity: 3,
        seats: [
          seat({ purchaseStatus: "approved", ticketStatus: "valid" }),
          seat({ purchaseStatus: "approved", ticketStatus: "valid" }),
          seat({ purchaseStatus: "approved", ticketStatus: "valid" }),
        ],
      },
      {
        label: "a mix of tickets, reviews and live holds",
        capacity: 10,
        seats: [
          seat({ purchaseStatus: "approved", ticketStatus: "valid" }),
          seat({ purchaseStatus: "under_verification", holdExpiresAt: null }),
          seat({ purchaseStatus: "changes_requested", holdExpiresAt: null }),
          seat({ holdExpiresAt: LIVE_HOLD }),
        ],
      },
      {
        label: "abandoned and cancelled seats that must not be counted",
        capacity: 5,
        seats: [
          seat({ purchaseStatus: "approved", ticketStatus: "valid" }),
          seat({ holdExpiresAt: LAPSED_HOLD }),
          seat({ purchaseStatus: "expired" }),
          seat({ purchaseStatus: "approved", ticketStatus: "cancelled" }),
        ],
      },
    ];

  for (const { label, seats, capacity } of cases) {
    it(label, () => {
      const states: RosterSeatState[] = seats.map((input) =>
        resolveRosterSeatState(input, NOW),
      );
      const totals = summarizeRoster(states);

      // Rebuild the availability inputs the way the SQL does: valid tickets,
      // plus lines whose purchase is under review or still holding.
      const availability = resolveAvailability({
        capacity,
        validTickets: totals.confirmed,
        activeHolds:
          totals.awaitingReview + totals.changesRequested + totals.holding,
      });

      expect(totals.occupied).toBe(availability.occupied);
      expect(capacity - totals.occupied).toBe(availability.remaining);
      expect(states.filter(occupiesSeat)).toHaveLength(availability.occupied);
    });
  }
});
