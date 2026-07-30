import { describe, expect, it } from "vitest";

import { resolveAvailability } from "@/app/lib/programs/inventory";
import {
  resolveAttendeeIdentity,
  resolveRegistrationCheck,
  type RegistrationCheckInput,
} from "@/app/lib/programs/registration";
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

const SEATS_LEFT = resolveAvailability({
  capacity: 20,
  validTickets: 5,
  activeHolds: 0,
});
const SOLD_OUT = resolveAvailability({
  capacity: 20,
  validTickets: 20,
  activeHolds: 0,
});

function checkInput(
  overrides: Partial<RegistrationCheckInput> = {},
): RegistrationCheckInput {
  return {
    occurrenceState: ON_SALE,
    audience: "all",
    eligibility: "public",
    price: 0,
    availability: SEATS_LEFT,
    hasExistingTicket: false,
    ...overrides,
  };
}

describe("resolveRegistrationCheck", () => {
  it("allows a free, open, in-audience registration with seats left", () => {
    expect(resolveRegistrationCheck(checkInput())).toEqual({ allowed: true });
  });

  it("refuses when the occurrence is not purchasable", () => {
    expect(
      resolveRegistrationCheck(checkInput({ occurrenceState: CLOSED })),
    ).toEqual({ allowed: false, blocker: "not_purchasable" });
  });

  it("refuses a public buyer on a participants-only session", () => {
    expect(
      resolveRegistrationCheck(
        checkInput({ audience: "participants_only", eligibility: "public" }),
      ),
    ).toEqual({ allowed: false, blocker: "audience_excluded" });
  });

  it("refuses an active participant on a public-only session", () => {
    expect(
      resolveRegistrationCheck(
        checkInput({
          audience: "public_only",
          eligibility: "active_participant",
        }),
      ),
    ).toEqual({ allowed: false, blocker: "audience_excluded" });
  });

  it("refuses a priced session — that needs the voucher flow", () => {
    expect(resolveRegistrationCheck(checkInput({ price: 50 }))).toEqual({
      allowed: false,
      blocker: "not_free",
    });
  });

  it("refuses when sold out", () => {
    expect(
      resolveRegistrationCheck(checkInput({ availability: SOLD_OUT })),
    ).toEqual({ allowed: false, blocker: "sold_out" });
  });

  describe("paid mode", () => {
    it("allows a priced session", () => {
      expect(
        resolveRegistrationCheck(checkInput({ price: 50, mode: "paid" })),
      ).toEqual({ allowed: true });
    });

    it("refuses a free session — a hold and voucher for zero makes no sense", () => {
      expect(
        resolveRegistrationCheck(checkInput({ price: 0, mode: "paid" })),
      ).toEqual({ allowed: false, blocker: "not_paid" });
    });

    it("applies every non-price rule exactly as the free path does", () => {
      expect(
        resolveRegistrationCheck(
          checkInput({
            price: 50,
            mode: "paid",
            occurrenceState: CLOSED,
          }),
        ),
      ).toEqual({ allowed: false, blocker: "not_purchasable" });

      expect(
        resolveRegistrationCheck(
          checkInput({ price: 50, mode: "paid", availability: SOLD_OUT }),
        ),
      ).toEqual({ allowed: false, blocker: "sold_out" });

      expect(
        resolveRegistrationCheck(
          checkInput({ price: 50, mode: "paid", hasExistingTicket: true }),
        ),
      ).toEqual({ allowed: false, blocker: "already_registered" });

      expect(
        resolveRegistrationCheck(
          checkInput({
            price: 50,
            mode: "paid",
            audience: "participants_only",
            eligibility: "public",
          }),
        ),
      ).toEqual({ allowed: false, blocker: "audience_excluded" });
    });

    it("keeps the free path the default when no mode is given", () => {
      expect(resolveRegistrationCheck(checkInput({ price: 50 }))).toEqual({
        allowed: false,
        blocker: "not_free",
      });
    });
  });

  it("refuses a duplicate registration", () => {
    expect(
      resolveRegistrationCheck(checkInput({ hasExistingTicket: true })),
    ).toEqual({ allowed: false, blocker: "already_registered" });
  });

  it("reports audience before availability, so exclusion is not disguised as full", () => {
    expect(
      resolveRegistrationCheck(
        checkInput({
          audience: "participants_only",
          eligibility: "public",
          availability: SOLD_OUT,
        }),
      ),
    ).toEqual({ allowed: false, blocker: "audience_excluded" });
  });

  it("reports a duplicate before sold out, so the buyer learns they already hold a seat", () => {
    expect(
      resolveRegistrationCheck(
        checkInput({ hasExistingTicket: true, availability: SOLD_OUT }),
      ),
    ).toEqual({ allowed: false, blocker: "already_registered" });
  });

  it("lets a waitlist invitation through a sold-out occurrence", () => {
    expect(
      resolveRegistrationCheck(
        checkInput({
          availability: SOLD_OUT,
          waitlistInvitationCoversSeat: true,
        }),
      ),
    ).toEqual({ allowed: true });
  });
});

describe("resolveAttendeeIdentity", () => {
  const profile = {
    id: 7,
    email: "ana@example.com",
    displayName: "Ana Glitter",
    firstName: "Ana",
    lastName: "Quispe",
  };

  it("prefers the display name for a signed-in attendee", () => {
    expect(resolveAttendeeIdentity(profile, null)).toEqual({
      userId: 7,
      name: "Ana Glitter",
      email: "ana@example.com",
    });
  });

  it("falls back to the full name, then the email", () => {
    expect(
      resolveAttendeeIdentity({ ...profile, displayName: null }, null),
    ).toEqual({ userId: 7, name: "Ana Quispe", email: "ana@example.com" });

    expect(
      resolveAttendeeIdentity(
        { ...profile, displayName: null, firstName: null, lastName: null },
        null,
      ),
    ).toEqual({ userId: 7, name: "ana@example.com", email: "ana@example.com" });
  });

  it("uses the guest details when there is no profile", () => {
    expect(
      resolveAttendeeIdentity(null, {
        name: "  Luis  ",
        email: " luis@example.com ",
      }),
    ).toEqual({ userId: null, name: "Luis", email: "luis@example.com" });
  });

  it("ignores guest details when a profile is present", () => {
    expect(
      resolveAttendeeIdentity(profile, {
        name: "Otro",
        email: "otro@example.com",
      }),
    ).toEqual({ userId: 7, name: "Ana Glitter", email: "ana@example.com" });
  });

  it("returns null when there is neither a profile nor guest details", () => {
    expect(resolveAttendeeIdentity(null, null)).toBeNull();
  });
});
