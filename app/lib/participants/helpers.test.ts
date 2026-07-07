import { describe, expect, it } from "vitest";

import {
  filterParticipantStatuses,
  filterProfileRequestStatuses,
  getPauseEligibilityReason,
  isParticipantStatusGroup,
  isProfileRequestStatusGroup,
  toProfileRequestSort,
} from "@/app/lib/participants/helpers";

describe("participant status grouping", () => {
  it("treats verified, paused, and banned as participants", () => {
    expect(isParticipantStatusGroup("verified")).toBe(true);
    expect(isParticipantStatusGroup("paused")).toBe(true);
    expect(isParticipantStatusGroup("banned")).toBe(true);
    expect(isParticipantStatusGroup("pending")).toBe(false);
    expect(isParticipantStatusGroup("rejected")).toBe(false);
  });

  it("treats pending and rejected as profile requests", () => {
    expect(isProfileRequestStatusGroup("pending")).toBe(true);
    expect(isProfileRequestStatusGroup("rejected")).toBe(true);
    expect(isProfileRequestStatusGroup("verified")).toBe(false);
    expect(isProfileRequestStatusGroup("paused")).toBe(false);
  });

  it("filters unknown statuses out of participant filters", () => {
    expect(filterParticipantStatuses(["verified", "pending"])).toEqual([
      "verified",
    ]);
    expect(filterProfileRequestStatuses(["pending", "verified"])).toEqual([
      "pending",
    ]);
  });
});

describe("toProfileRequestSort", () => {
  it("keeps supported user profile sort fields", () => {
    expect(toProfileRequestSort("displayName")).toBe("displayName");
    expect(toProfileRequestSort("verifiedAt")).toBe("verifiedAt");
  });

  it("falls back for participant-only sort fields", () => {
    expect(toProfileRequestSort("lastParticipationAt")).toBe("updatedAt");
    expect(toProfileRequestSort("lastTermsAcceptedAt")).toBe("updatedAt");
  });
});

describe("getPauseEligibilityReason", () => {
  it("marks users with recent accepted participation as ineligible", () => {
    const result = getPauseEligibilityReason({
      status: "verified",
      role: "user",
      participatedRecently: true,
    });

    expect(result).toEqual({
      isPauseEligible: false,
      pauseEligibilityReason: "Activo reciente",
    });
  });

  it("marks users with only older participation as eligible", () => {
    const result = getPauseEligibilityReason({
      status: "verified",
      role: "user",
      participatedRecently: false,
    });

    expect(result).toEqual({
      isPauseEligible: true,
      pauseEligibilityReason: "Elegible",
    });
  });

  it("rejects paused, banned, pending, rejected, and admin accounts", () => {
    expect(
      getPauseEligibilityReason({
        status: "paused",
        role: "user",
        participatedRecently: false,
      }).isPauseEligible,
    ).toBe(false);
    expect(
      getPauseEligibilityReason({
        status: "banned",
        role: "user",
        participatedRecently: false,
      }).pauseEligibilityReason,
    ).toBe("Vetado");
    expect(
      getPauseEligibilityReason({
        status: "pending",
        role: "user",
        participatedRecently: false,
      }).isPauseEligible,
    ).toBe(false);
    expect(
      getPauseEligibilityReason({
        status: "rejected",
        role: "user",
        participatedRecently: false,
      }).isPauseEligible,
    ).toBe(false);
    expect(
      getPauseEligibilityReason({
        status: "verified",
        role: "admin",
        participatedRecently: false,
      }).pauseEligibilityReason,
    ).toBe("Cuenta de administrador");
    expect(
      getPauseEligibilityReason({
        status: "verified",
        role: "festival_admin",
        participatedRecently: false,
      }).pauseEligibilityReason,
    ).toBe("Cuenta de administrador");
  });
});
