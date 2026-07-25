import { describe, expect, it } from "vitest";

import {
  calculateReservationEligibleAt,
  canQualifySanctionStatus,
  festivalActivationQualifiesSanction,
  sanctionScopeMatchesFestival,
} from "@/app/lib/sanctions/festival-qualification";

describe("sanctionScopeMatchesFestival", () => {
  it("matches global to any brand and brand scopes only to themselves", () => {
    expect(sanctionScopeMatchesFestival("global", "glitter")).toBe(true);
    expect(sanctionScopeMatchesFestival("glitter", "glitter")).toBe(true);
    expect(sanctionScopeMatchesFestival("glitter", "festicker")).toBe(false);
    expect(sanctionScopeMatchesFestival("twinkler", "twinkler")).toBe(true);
  });
});

describe("festivalActivationQualifiesSanction", () => {
  const approvedAt = new Date("2026-07-01T12:00:00.000Z");
  const activatedAt = new Date("2026-07-10T12:00:00.000Z");

  it("qualifies active/scheduled sanctions after approval with matching scope", () => {
    expect(
      festivalActivationQualifiesSanction({
        activatedAt,
        approvedAt,
        startsAt: approvedAt,
        sanctionStatus: "active",
        festivalScope: "global",
        festivalType: "glitter",
      }),
    ).toBe(true);

    expect(
      festivalActivationQualifiesSanction({
        activatedAt,
        approvedAt,
        startsAt: approvedAt,
        sanctionStatus: "scheduled",
        festivalScope: "glitter",
        festivalType: "glitter",
      }),
    ).toBe(true);
  });

  it("rejects already-active festivals, mismatched brands, and inactive statuses", () => {
    expect(
      festivalActivationQualifiesSanction({
        activatedAt: approvedAt,
        approvedAt,
        startsAt: approvedAt,
        sanctionStatus: "active",
        festivalScope: "global",
        festivalType: "glitter",
      }),
    ).toBe(false);

    expect(
      festivalActivationQualifiesSanction({
        activatedAt: new Date("2026-06-01T12:00:00.000Z"),
        approvedAt,
        startsAt: approvedAt,
        sanctionStatus: "active",
        festivalScope: "global",
        festivalType: "glitter",
      }),
    ).toBe(false);

    expect(
      festivalActivationQualifiesSanction({
        activatedAt,
        approvedAt,
        startsAt: approvedAt,
        sanctionStatus: "active",
        festivalScope: "festicker",
        festivalType: "glitter",
      }),
    ).toBe(false);

    expect(
      festivalActivationQualifiesSanction({
        activatedAt,
        approvedAt,
        startsAt: approvedAt,
        sanctionStatus: "revoked",
        festivalScope: "global",
        festivalType: "glitter",
      }),
    ).toBe(false);

    expect(canQualifySanctionStatus("expired")).toBe(false);
  });

  it("rejects sanctions that ended before activation or start after the festival", () => {
    expect(
      festivalActivationQualifiesSanction({
        activatedAt,
        approvedAt,
        startsAt: approvedAt,
        endsAt: new Date("2026-07-09T12:00:00.000Z"),
        sanctionStatus: "active",
        festivalScope: "global",
        festivalType: "glitter",
      }),
    ).toBe(false);

    expect(
      festivalActivationQualifiesSanction({
        activatedAt,
        approvedAt,
        startsAt: new Date("2026-08-01T12:00:00.000Z"),
        festivalEndAt: new Date("2026-07-31T12:00:00.000Z"),
        sanctionStatus: "scheduled",
        festivalScope: "global",
        festivalType: "glitter",
      }),
    ).toBe(false);
  });
});

describe("calculateReservationEligibleAt", () => {
  it("adds delay minutes only for reservation_delay sanctions", () => {
    const start = new Date("2026-08-01T10:00:00.000Z");

    expect(
      calculateReservationEligibleAt({
        reservationsStartDate: start,
        reservationDelayMinutes: 120,
        sanctionType: "reservation_delay",
      })?.toISOString(),
    ).toBe("2026-08-01T12:00:00.000Z");

    expect(
      calculateReservationEligibleAt({
        reservationsStartDate: start,
        reservationDelayMinutes: 120,
        sanctionType: "ban",
      }),
    ).toBeNull();

    expect(
      calculateReservationEligibleAt({
        reservationsStartDate: start,
        reservationDelayMinutes: null,
        sanctionType: "reservation_delay",
      }),
    ).toBeNull();
  });
});
