import { describe, expect, it } from "vitest";

import {
  canResendTicket,
  getTicketResendDisabledReason,
  TICKET_RESEND_BLOCKER_LABELS,
} from "@/app/lib/tickets/resend";

const allowed = { isStaff: true, festivalIsActive: true, ticketNumber: 2 };

describe("canResendTicket", () => {
  it("allows staff to resend a numbered ticket of the active festival", () => {
    expect(canResendTicket(allowed)).toEqual({ allowed: true });
  });

  /**
   * The action is reachable by anyone, so a caller who is not staff should
   * learn only that it is restricted, not anything about the ticket.
   */
  it("refuses non-staff first, even when other blockers also apply", () => {
    expect(
      canResendTicket({
        isStaff: false,
        festivalIsActive: false,
        ticketNumber: null,
      }),
    ).toEqual({ allowed: false, blocker: "not_staff" });
  });

  it("refuses a ticket of a festival that is not active", () => {
    expect(canResendTicket({ ...allowed, festivalIsActive: false })).toEqual({
      allowed: false,
      blocker: "festival_not_active",
    });
  });

  it("refuses a ticket without a number, which would mail an unscannable code", () => {
    expect(canResendTicket({ ...allowed, ticketNumber: null })).toEqual({
      allowed: false,
      blocker: "no_ticket_code",
    });
  });
});

describe("getTicketResendDisabledReason", () => {
  it("is undefined when the resend is allowed", () => {
    expect(getTicketResendDisabledReason(allowed)).toBeUndefined();
  });

  it("names the blocker otherwise", () => {
    expect(getTicketResendDisabledReason({ ...allowed, isStaff: false })).toBe(
      TICKET_RESEND_BLOCKER_LABELS.not_staff,
    );
    expect(
      getTicketResendDisabledReason({ ...allowed, festivalIsActive: false }),
    ).toBe("Solo se pueden reenviar entradas del festival activo.");
  });
});
