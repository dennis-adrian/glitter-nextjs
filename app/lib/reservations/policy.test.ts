import { describe, expect, it } from "vitest";

import {
  evaluateSelfServiceEligibility,
  mapPartnerEligibilityCode,
  standMatchesParticipant,
  type SelfServiceEligibilityInput,
} from "@/app/lib/reservations/policy";

const now = new Date("2026-08-29T12:00:00.000Z");

function allowedInput(
  overrides: Partial<SelfServiceEligibilityInput> = {},
): SelfServiceEligibilityInput {
  return {
    now,
    actor: { id: 3, role: "user" },
    targetProfileId: 3,
    intent: "mutate",
    profile: { id: 3, status: "verified" },
    festival: {
      id: 10,
      status: "active",
      reservationsStartDate: new Date("2026-08-01T10:00:00.000Z"),
      participantTermsEnabled: true,
    },
    publishedTermsVersionId: 1,
    enrollment: {
      type: "festival_participation",
      status: "accepted",
      termsVersionId: 1,
    },
    sanctionBlocked: false,
    hasLiveSelfServiceReservation: false,
    ...overrides,
  };
}

describe("evaluateSelfServiceEligibility", () => {
  it("allows a verified enrolled participant during an open active festival", () => {
    expect(evaluateSelfServiceEligibility(allowedInput())).toEqual({
      allowed: true,
    });
  });

  it.each(["pending", "rejected", "banned", "paused"] as const)(
    "denies user status %s",
    (status) => {
      expect(
        evaluateSelfServiceEligibility(
          allowedInput({ profile: { id: 3, status } }),
        ),
      ).toEqual({ allowed: false, code: "PROFILE_NOT_VERIFIED" });
    },
  );

  it.each(["draft", "published", "archived"] as const)(
    "denies festival status %s",
    (status) => {
      expect(
        evaluateSelfServiceEligibility(
          allowedInput({
            festival: {
              id: 10,
              status,
              reservationsStartDate: new Date("2026-08-01T10:00:00.000Z"),
              participantTermsEnabled: true,
            },
          }),
        ),
      ).toEqual({ allowed: false, code: "FESTIVAL_NOT_ACTIVE" });
    },
  );

  it("denies before reservations open", () => {
    expect(
      evaluateSelfServiceEligibility(
        allowedInput({ now: new Date("2026-07-31T23:59:59.000Z") }),
      ),
    ).toEqual({ allowed: false, code: "RESERVATIONS_NOT_OPEN" });
  });

  it("allows exactly at reservationsStartDate", () => {
    expect(
      evaluateSelfServiceEligibility(
        allowedInput({ now: new Date("2026-08-01T10:00:00.000Z") }),
      ),
    ).toEqual({ allowed: true });
  });

  it("denies missing or pending enrollment and the wrong request type", () => {
    expect(
      evaluateSelfServiceEligibility(allowedInput({ enrollment: null })),
    ).toEqual({ allowed: false, code: "NOT_ENROLLED" });
    expect(
      evaluateSelfServiceEligibility(
        allowedInput({
          enrollment: {
            type: "festival_participation",
            status: "pending",
            termsVersionId: 1,
          },
        }),
      ),
    ).toEqual({ allowed: false, code: "NOT_ENROLLED" });
    expect(
      evaluateSelfServiceEligibility(
        allowedInput({
          enrollment: {
            type: "become_artist",
            status: "accepted",
            termsVersionId: 1,
          },
        }),
      ),
    ).toEqual({ allowed: false, code: "NOT_ENROLLED" });
  });

  it("denies when terms are disabled or unpublished", () => {
    expect(
      evaluateSelfServiceEligibility(
        allowedInput({
          festival: {
            id: 10,
            status: "active",
            reservationsStartDate: new Date("2026-08-01T10:00:00.000Z"),
            participantTermsEnabled: false,
          },
        }),
      ),
    ).toEqual({ allowed: false, code: "TERMS_UNAVAILABLE" });
    expect(
      evaluateSelfServiceEligibility(
        allowedInput({ publishedTermsVersionId: null }),
      ),
    ).toEqual({ allowed: false, code: "TERMS_UNAVAILABLE" });
  });

  it("denies stale terms separately from missing enrollment", () => {
    expect(
      evaluateSelfServiceEligibility(
        allowedInput({
          enrollment: {
            type: "festival_participation",
            status: "accepted",
            termsVersionId: 99,
          },
        }),
      ),
    ).toEqual({ allowed: false, code: "TERMS_STALE" });
  });

  it("denies sanctions and live self-service reservations", () => {
    expect(
      evaluateSelfServiceEligibility(allowedInput({ sanctionBlocked: true })),
    ).toEqual({ allowed: false, code: "SANCTION_BLOCKED" });
    expect(
      evaluateSelfServiceEligibility(
        allowedInput({ hasLiveSelfServiceReservation: true }),
      ),
    ).toEqual({ allowed: false, code: "ALREADY_RESERVED" });
  });

  it("rejects festival_admin mutate-on-behalf but allows view", () => {
    expect(
      evaluateSelfServiceEligibility(
        allowedInput({
          actor: { id: 1, role: "festival_admin" },
          targetProfileId: 3,
          intent: "mutate",
        }),
      ),
    ).toEqual({ allowed: false, code: "UNAUTHORIZED" });
    expect(
      evaluateSelfServiceEligibility(
        allowedInput({
          actor: { id: 1, role: "festival_admin" },
          targetProfileId: 3,
          intent: "view",
        }),
      ),
    ).toEqual({ allowed: true });
  });

  it("rejects admin mutate-on-behalf for self-service", () => {
    expect(
      evaluateSelfServiceEligibility(
        allowedInput({
          actor: { id: 1, role: "admin" },
          targetProfileId: 3,
          intent: "mutate",
        }),
      ),
    ).toEqual({ allowed: false, code: "UNAUTHORIZED" });
  });

  it("allows an admin to reserve when they own the profile", () => {
    expect(
      evaluateSelfServiceEligibility(
        allowedInput({
          actor: { id: 3, role: "admin" },
          targetProfileId: 3,
        }),
      ),
    ).toEqual({ allowed: true });
  });
});

describe("standMatchesParticipant", () => {
  it("matches unrestricted stands in the same category and participation type", () => {
    expect(
      standMatchesParticipant({
        standCategory: "illustration",
        participationType: "standard",
        eligibleSubcategoryIds: [],
        profileCategory: "illustration",
        profileParticipationType: "standard",
        profileSubcategoryIds: [8],
      }),
    ).toBe(true);
  });

  it("treats deprecated new_artist as illustration", () => {
    expect(
      standMatchesParticipant({
        standCategory: "illustration",
        participationType: "standard",
        eligibleSubcategoryIds: [],
        profileCategory: "new_artist",
        profileParticipationType: "standard",
        profileSubcategoryIds: [],
      }),
    ).toBe(true);
  });

  it("rejects category, participation type, and non-overlapping subcategories", () => {
    expect(
      standMatchesParticipant({
        standCategory: "gastronomy",
        participationType: "standard",
        eligibleSubcategoryIds: [],
        profileCategory: "illustration",
        profileParticipationType: "standard",
        profileSubcategoryIds: [],
      }),
    ).toBe(false);
    expect(
      standMatchesParticipant({
        standCategory: "illustration",
        participationType: "live_activity",
        eligibleSubcategoryIds: [],
        profileCategory: "illustration",
        profileParticipationType: "standard",
        profileSubcategoryIds: [],
      }),
    ).toBe(false);
    expect(
      standMatchesParticipant({
        standCategory: "illustration",
        participationType: "standard",
        eligibleSubcategoryIds: [1, 2],
        profileCategory: "illustration",
        profileParticipationType: "standard",
        profileSubcategoryIds: [9],
      }),
    ).toBe(false);
  });

  it("accepts a restricted stand when any subcategory overlaps", () => {
    expect(
      standMatchesParticipant({
        standCategory: "illustration",
        participationType: "standard",
        eligibleSubcategoryIds: [1, 2],
        profileCategory: "illustration",
        profileParticipationType: "standard",
        profileSubcategoryIds: [2, 9],
      }),
    ).toBe(true);
  });
});

describe("mapPartnerEligibilityCode", () => {
  it("maps already reserved to the partner-specific code", () => {
    expect(mapPartnerEligibilityCode("ALREADY_RESERVED")).toBe(
      "PARTNER_ALREADY_RESERVED",
    );
    expect(mapPartnerEligibilityCode("TERMS_STALE")).toBe(
      "PARTNER_NOT_ELIGIBLE",
    );
  });
});
