import { describe, expect, it } from "vitest";

import { resolveAvailability } from "@/app/lib/programs/inventory";
import {
  isDuplicateWaitlistEntryError,
  resolveInvitationUse,
  resolveInvitationWindowMinutes,
  resolveWaitlistJoin,
  type InvitationSubject,
  type WaitlistJoinInput,
} from "@/app/lib/programs/waitlist";
import type { ResolvedOccurrenceState } from "@/app/lib/programs/state";

const ON_SALE: ResolvedOccurrenceState = {
  state: "on_sale",
  isPurchasable: true,
  isPubliclyVisible: true,
  wasRescheduled: false,
};
const CLOSED: ResolvedOccurrenceState = {
  state: "sales_closed",
  isPurchasable: false,
  isPubliclyVisible: true,
  wasRescheduled: false,
};

const SOLD_OUT = resolveAvailability({
  capacity: 20,
  validTickets: 20,
  activeHolds: 0,
});
const SEATS_LEFT = resolveAvailability({
  capacity: 20,
  validTickets: 5,
  activeHolds: 0,
});

function joinInput(
  overrides: Partial<WaitlistJoinInput> = {},
): WaitlistJoinInput {
  return {
    occurrenceState: ON_SALE,
    availability: SOLD_OUT,
    hasExistingTicket: false,
    isAlreadyWaiting: false,
    ...overrides,
  };
}

describe("resolveWaitlistJoin", () => {
  it("allows joining a sold-out occurrence that is on sale", () => {
    expect(resolveWaitlistJoin(joinInput())).toEqual({ allowed: true });
  });

  it("refuses when seats remain — buying is the answer", () => {
    expect(
      resolveWaitlistJoin(joinInput({ availability: SEATS_LEFT })),
    ).toEqual({ allowed: false, blocker: "seats_available" });
  });

  it("refuses when sales are closed", () => {
    expect(resolveWaitlistJoin(joinInput({ occurrenceState: CLOSED }))).toEqual(
      { allowed: false, blocker: "not_on_sale" },
    );
  });

  it("refuses someone who already holds a ticket", () => {
    expect(resolveWaitlistJoin(joinInput({ hasExistingTicket: true }))).toEqual(
      { allowed: false, blocker: "already_registered" },
    );
  });

  it("refuses a second join", () => {
    expect(resolveWaitlistJoin(joinInput({ isAlreadyWaiting: true }))).toEqual({
      allowed: false,
      blocker: "already_waiting",
    });
  });

  it("reports the duplicate before the free seat, so the message is actionable", () => {
    // Both conditions hold; being told "you are already on the list" explains
    // the state, "there are seats" does not.
    expect(
      resolveWaitlistJoin(
        joinInput({ isAlreadyWaiting: true, availability: SEATS_LEFT }),
      ),
    ).toEqual({ allowed: false, blocker: "already_waiting" });
  });

  it("reports closed sales before anything else", () => {
    expect(
      resolveWaitlistJoin(
        joinInput({
          occurrenceState: CLOSED,
          hasExistingTicket: true,
          isAlreadyWaiting: true,
        }),
      ),
    ).toEqual({ allowed: false, blocker: "not_on_sale" });
  });
});

const NOW = new Date("2026-08-01T12:00:00.000Z");

function invitation(
  overrides: Partial<InvitationSubject> = {},
): InvitationSubject {
  return {
    status: "sent",
    expiresAt: new Date("2026-08-02T12:00:00.000Z"),
    entryStatus: "invited",
    ...overrides,
  };
}

describe("resolveInvitationUse", () => {
  it("accepts a live invitation", () => {
    expect(resolveInvitationUse(invitation(), NOW)).toEqual({ allowed: true });
  });

  it.each(["converted", "expired", "revoked"] as const)(
    "refuses a %s invitation",
    (status) => {
      expect(resolveInvitationUse(invitation({ status }), NOW)).toEqual({
        allowed: false,
        blocker: "not_live",
      });
    },
  );

  it("refuses past the deadline even while the row still says sent", () => {
    expect(
      resolveInvitationUse(
        invitation({ expiresAt: new Date("2026-08-01T11:59:59.000Z") }),
        NOW,
      ),
    ).toEqual({ allowed: false, blocker: "expired" });
  });

  it("treats the exact deadline as expired", () => {
    expect(resolveInvitationUse(invitation({ expiresAt: NOW }), NOW)).toEqual({
      allowed: false,
      blocker: "expired",
    });
  });

  it("refuses once the entry was removed", () => {
    expect(
      resolveInvitationUse(invitation({ entryStatus: "removed" }), NOW),
    ).toEqual({ allowed: false, blocker: "entry_closed" });
  });
});

describe("resolveInvitationWindowMinutes", () => {
  it("prefers the program override", () => {
    expect(
      resolveInvitationWindowMinutes(
        { waitlistInvitationWindowMinutes: 120 },
        { defaultWaitlistInvitationWindowMinutes: 1440 },
      ),
    ).toBe(120);
  });

  it("falls back to the global default", () => {
    expect(
      resolveInvitationWindowMinutes(
        { waitlistInvitationWindowMinutes: null },
        { defaultWaitlistInvitationWindowMinutes: 1440 },
      ),
    ).toBe(1440);
  });
});

describe("isDuplicateWaitlistEntryError", () => {
  // Both partial unique indexes share this prefix; the driver reports the
  // index name in `constraint`.
  const pgError = (constraint: string) => ({ code: "23505", constraint });

  it("recognises both identity branches", () => {
    expect(
      isDuplicateWaitlistEntryError(
        pgError("session_waitlist_entries_occurrence_user_idx"),
      ),
    ).toBe(true);
    expect(
      isDuplicateWaitlistEntryError(
        pgError("session_waitlist_entries_occurrence_email_idx"),
      ),
    ).toBe(true);
  });

  it("unwraps a cause chain, the way drizzle rethrows", () => {
    const wrapped = new Error("insert failed", {
      cause: pgError("session_waitlist_entries_occurrence_user_idx"),
    });
    expect(isDuplicateWaitlistEntryError(wrapped)).toBe(true);
  });

  it("does not claim unrelated violations", () => {
    // A different table's 23505 must fall through to the generic message,
    // otherwise a real fault is reported to the buyer as "already waiting".
    expect(
      isDuplicateWaitlistEntryError(
        pgError("session_tickets_occurrence_attendee_email_idx"),
      ),
    ).toBe(false);
    expect(
      isDuplicateWaitlistEntryError(
        pgError("session_waitlist_invitations_live_idx"),
      ),
    ).toBe(false);
    expect(isDuplicateWaitlistEntryError({ code: "23503" })).toBe(false);
    expect(isDuplicateWaitlistEntryError(new Error("boom"))).toBe(false);
    expect(isDuplicateWaitlistEntryError(null)).toBe(false);
  });
});
