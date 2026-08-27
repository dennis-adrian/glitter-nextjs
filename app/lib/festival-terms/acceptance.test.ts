import { describe, expect, it } from "vitest";

import {
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
  it("treats a matching version id as current acceptance", () => {
    expect(hasAcceptedCurrentFestivalTerms(profile(4), 10, 4)).toBe(true);
    expect(hasAcceptedCurrentFestivalTerms(profile(3), 10, 4)).toBe(false);
    expect(hasAcceptedCurrentFestivalTerms(profile(null), 10, 4)).toBe(false);
  });

  it("requires a new acceptance for each festival even if another festival is current", () => {
    expect(hasAcceptedCurrentFestivalTerms(profile(4), 11, 4)).toBe(false);
  });

  it("requires re-acceptance only on active festivals with a stale version", () => {
    expect(
      needsFestivalTermsReacceptance(
        { id: 10, status: "active" },
        profile(3),
        4,
      ),
    ).toBe(true);
    expect(
      needsFestivalTermsReacceptance(
        { id: 10, status: "archived" },
        profile(3),
        4,
      ),
    ).toBe(false);
    expect(
      needsFestivalTermsReacceptance(
        { id: 10, status: "active" },
        profile(4),
        4,
      ),
    ).toBe(false);
    expect(
      needsFestivalTermsReacceptance(
        { id: 10, status: "active" },
        { userRequests: [] },
        4,
      ),
    ).toBe(false);
  });

  it("does not require re-acceptance when no published version exists", () => {
    expect(
      needsFestivalTermsReacceptance(
        { id: 10, status: "active" },
        profile(3),
        null,
      ),
    ).toBe(false);
    expect(
      needsFestivalTermsReacceptance(
        { id: 10, status: "active" },
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
