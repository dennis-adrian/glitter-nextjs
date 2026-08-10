import { describe, expect, it } from "vitest";

import {
  isCheckInAccepted,
  normalizeTicketCode,
  resolveCheckIn,
  type CheckInResolutionInput,
  type CheckInTicket,
} from "@/app/lib/programs/checkin";

const OCCURRENCE_ID = 42;
const CHECKED_IN_AT = new Date("2026-08-10T14:05:00.000Z");

function ticket(overrides: Partial<CheckInTicket> = {}): CheckInTicket {
  return {
    ticketId: 7,
    occurrenceId: OCCURRENCE_ID,
    status: "valid",
    attendeeName: "María Fernández",
    sessionTitle: "Taller de Acuarela",
    checkedInAt: null,
    ...overrides,
  };
}

function input(
  overrides: Partial<CheckInResolutionInput> = {},
): CheckInResolutionInput {
  return {
    ticket: ticket(),
    targetOccurrenceId: OCCURRENCE_ID,
    targetLifecycleStatus: "scheduled",
    ...overrides,
  };
}

describe("resolveCheckIn", () => {
  it("lets a valid ticket for this occurrence through to the insert", () => {
    // Null is the "proceed" signal — the unique constraint, not this function,
    // decides between checked_in and already_used.
    expect(resolveCheckIn(input())).toBeNull();
  });

  it("rejects a code that matches no ticket", () => {
    expect(resolveCheckIn(input({ ticket: null }))).toEqual({
      outcome: "not_found",
    });
  });

  it("names the right session when the ticket is for another occurrence", () => {
    const result = resolveCheckIn(
      input({
        ticket: ticket({ occurrenceId: 99, sessionTitle: "Charla de Color" }),
      }),
    );

    expect(result).toEqual({
      outcome: "wrong_occurrence",
      sessionTitle: "Charla de Color",
    });
  });

  it("rejects a cancelled ticket", () => {
    expect(
      resolveCheckIn(input({ ticket: ticket({ status: "cancelled" }) })),
    ).toEqual({ outcome: "cancelled", attendeeName: "María Fernández" });
  });

  it("reports a prior attendance with who and when", () => {
    const result = resolveCheckIn(
      input({ ticket: ticket({ checkedInAt: CHECKED_IN_AT }) }),
    );

    expect(result).toEqual({
      outcome: "already_used",
      attendeeName: "María Fernández",
      checkedInAt: CHECKED_IN_AT,
    });
  });

  it("closes the door for a cancelled occurrence before reading the ticket", () => {
    // Even a perfectly valid ticket: nobody is getting into a session that is
    // not happening, and whose ticket it is does not change that.
    expect(
      resolveCheckIn(input({ targetLifecycleStatus: "cancelled" })),
    ).toEqual({ outcome: "occurrence_closed" });
  });

  it("still admits a completed occurrence", () => {
    // Marking an occurrence completed is bookkeeping that can happen while
    // stragglers are still arriving; only `cancelled` shuts the door.
    expect(
      resolveCheckIn(input({ targetLifecycleStatus: "completed" })),
    ).toBeNull();
  });

  it("prefers the wrong-session message over the cancelled one", () => {
    const result = resolveCheckIn(
      input({
        ticket: ticket({
          occurrenceId: 99,
          status: "cancelled",
          sessionTitle: "Charla de Color",
        }),
      }),
    );

    expect(result).toEqual({
      outcome: "wrong_occurrence",
      sessionTitle: "Charla de Color",
    });
  });

  it("prefers the cancelled message over the already-used one", () => {
    // A ticket cancelled after it was scanned keeps its attendance history,
    // but the ticket is void and that is what the door must be told.
    const result = resolveCheckIn(
      input({
        ticket: ticket({ status: "cancelled", checkedInAt: CHECKED_IN_AT }),
      }),
    );

    expect(result).toEqual({
      outcome: "cancelled",
      attendeeName: "María Fernández",
    });
  });
});

describe("isCheckInAccepted", () => {
  it("accepts only a fresh check-in", () => {
    expect(isCheckInAccepted("checked_in")).toBe(true);

    for (const outcome of [
      "already_used",
      "wrong_occurrence",
      "cancelled",
      "not_found",
      "occurrence_closed",
    ] as const) {
      expect(isCheckInAccepted(outcome)).toBe(false);
    }
  });
});

describe("normalizeTicketCode", () => {
  it("keeps a bare code untouched", () => {
    expect(normalizeTicketCode("HcE7xK2mQp9rTn4vYw1zLa")).toBe(
      "HcE7xK2mQp9rTn4vYw1zLa",
    );
  });

  it("trims whitespace a phone keyboard adds", () => {
    expect(normalizeTicketCode("  HcE7xK2mQp9rTn4vYw1zLa \n")).toBe(
      "HcE7xK2mQp9rTn4vYw1zLa",
    );
  });

  it("takes the last segment of a URL-shaped payload", () => {
    expect(
      normalizeTicketCode(
        "https://productoraglitter.com/t/HcE7xK2mQp9rTn4vYw1zLa",
      ),
    ).toBe("HcE7xK2mQp9rTn4vYw1zLa");
  });

  it("drops a query string or fragment", () => {
    expect(
      normalizeTicketCode("https://x.com/t/HcE7xK2mQp9rTn4vYw1zLa?utm=email"),
    ).toBe("HcE7xK2mQp9rTn4vYw1zLa");
    expect(normalizeTicketCode("HcE7xK2mQp9rTn4vYw1zLa#top")).toBe(
      "HcE7xK2mQp9rTn4vYw1zLa",
    );
  });

  it("preserves base64url characters that are not path separators", () => {
    // `-` and `_` are part of the alphabet; stripping them would break codes.
    expect(normalizeTicketCode("ab-cd_ef12345678901234")).toBe(
      "ab-cd_ef12345678901234",
    );
  });

  it("returns empty for input with nothing usable", () => {
    expect(normalizeTicketCode("   ")).toBe("");
    expect(normalizeTicketCode("")).toBe("");
    expect(normalizeTicketCode("///")).toBe("");
  });
});
