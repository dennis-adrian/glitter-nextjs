import { describe, expect, it } from "vitest";

import {
  getFestivalParticipationRequest,
  hasAcceptedCurrentFestivalTerms,
  needsFestivalTermsReacceptance,
  nextEnrollmentTermsWrite,
} from "@/app/lib/festival-terms/acceptance";

const profile = (termsVersionId: number | null) => ({
  userRequests: [
    {
      festivalId: 10,
      type: "festival_participation" as const,
      status: "accepted" as const,
      termsVersionId,
    },
  ],
});

describe("festival terms acceptance", () => {
  it("selects the latest festival_participation by updatedAt", () => {
    const older = {
      id: 1,
      festivalId: 10,
      type: "festival_participation" as const,
      status: "accepted" as const,
      termsVersionId: 3,
      updatedAt: new Date("2024-01-01T00:00:00Z"),
      createdAt: new Date("2024-01-01T00:00:00Z"),
    };
    const newer = {
      id: 2,
      festivalId: 10,
      type: "festival_participation" as const,
      status: "accepted" as const,
      termsVersionId: 4,
      updatedAt: new Date("2024-06-01T00:00:00Z"),
      createdAt: new Date("2024-02-01T00:00:00Z"),
    };
    expect(
      getFestivalParticipationRequest(
        { userRequests: [older, newer] },
        10,
      )?.termsVersionId,
    ).toBe(4);
    expect(
      getFestivalParticipationRequest(
        { userRequests: [newer, older] },
        10,
      )?.termsVersionId,
    ).toBe(4);
    expect(
      getFestivalParticipationRequest({ userRequests: [older, newer] }, 99),
    ).toBeUndefined();
  });

  it("treats a matching version id as current acceptance", () => {
    expect(hasAcceptedCurrentFestivalTerms(profile(4), 10, 4)).toBe(true);
    expect(hasAcceptedCurrentFestivalTerms(profile(3), 10, 4)).toBe(false);
    expect(hasAcceptedCurrentFestivalTerms(profile(null), 10, 4)).toBe(false);
  });

  it("requires a new acceptance for each festival even if another festival is current", () => {
    expect(hasAcceptedCurrentFestivalTerms(profile(4), 11, 4)).toBe(false);
  });

  it("requires re-acceptance only on active festivals with a stale version", () => {
    const activeFestival = {
      id: 10,
      status: "active" as const,
      participantTermsEnabled: true,
    };
    expect(
      needsFestivalTermsReacceptance(activeFestival, profile(3), 4),
    ).toBe(true);
    expect(
      needsFestivalTermsReacceptance(
        { id: 10, status: "archived", participantTermsEnabled: true },
        profile(3),
        4,
      ),
    ).toBe(false);
    expect(
      needsFestivalTermsReacceptance(activeFestival, profile(4), 4),
    ).toBe(false);
    expect(
      needsFestivalTermsReacceptance(
        activeFestival,
        { userRequests: [] },
        4,
      ),
    ).toBe(false);
  });

  it("does not require re-acceptance when participant terms are disabled", () => {
    expect(
      needsFestivalTermsReacceptance(
        { id: 10, status: "active", participantTermsEnabled: false },
        profile(3),
        4,
      ),
    ).toBe(false);
  });

  it("does not require re-acceptance when no published version exists", () => {
    expect(
      needsFestivalTermsReacceptance(
        { id: 10, status: "active", participantTermsEnabled: true },
        profile(3),
        null,
      ),
    ).toBe(false);
    expect(
      needsFestivalTermsReacceptance(
        { id: 10, status: "active", participantTermsEnabled: true },
        profile(null),
        undefined,
      ),
    ).toBe(false);
  });

  it("decides insert, reaccept, or noop when writing an enrollment", () => {
    expect(nextEnrollmentTermsWrite(null, 4)).toEqual({ type: "insert" });
    expect(nextEnrollmentTermsWrite({ termsVersionId: 3 }, 4)).toEqual({
      type: "reaccept",
    });
    expect(nextEnrollmentTermsWrite({ termsVersionId: 4 }, 4)).toEqual({
      type: "noop",
    });
    expect(nextEnrollmentTermsWrite(null, null).type).toBe("error");
  });
});
