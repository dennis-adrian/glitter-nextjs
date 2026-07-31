import { describe, expect, it } from "vitest";

import { BaseProfile } from "@/app/api/users/definitions";
import {
  ACTIVE_PARTICIPANT_STATUS,
  ELIGIBILITY_DEFINITION_VERSION,
  NO_SANCTIONS,
  activeBanSanctionIds,
  canPurchaseAudience,
  isActiveParticipant,
  resolveBuyerEligibility,
  type BanSanctionRow,
  type EligibilityProfile,
  type SessionAudience,
} from "@/app/lib/programs/eligibility";

const NOW = new Date("2026-08-01T14:22:05.000Z");

function profile(
  status: BaseProfile["status"],
  role: BaseProfile["role"] = "user",
): EligibilityProfile {
  return { id: 7, status, role };
}

function ban(overrides: Partial<BanSanctionRow> = {}): BanSanctionRow {
  return {
    id: 1,
    status: "active",
    startsAt: new Date("2026-07-01T00:00:00.000Z"),
    endsAt: null,
    ...overrides,
  };
}

const ineligibleStatuses: BaseProfile["status"][] = [
  "pending",
  "rejected",
  "banned",
  "paused",
];

describe("isActiveParticipant", () => {
  it("recognizes only verified profiles", () => {
    expect(
      isActiveParticipant(profile(ACTIVE_PARTICIPANT_STATUS), NO_SANCTIONS),
    ).toBe(true);

    for (const status of ineligibleStatuses) {
      expect(isActiveParticipant(profile(status), NO_SANCTIONS)).toBe(false);
    }
  });

  it("treats guests and unauthenticated visitors as public", () => {
    expect(isActiveParticipant(null, NO_SANCTIONS)).toBe(false);
    expect(isActiveParticipant(undefined, NO_SANCTIONS)).toBe(false);
  });

  it("ignores role, so a verified admin buys as an active participant", () => {
    expect(
      isActiveParticipant(profile("verified", "admin"), NO_SANCTIONS),
    ).toBe(true);
    expect(isActiveParticipant(profile("paused", "admin"), NO_SANCTIONS)).toBe(
      false,
    );
  });

  it("disqualifies a verified profile serving an active ban", () => {
    expect(
      isActiveParticipant(profile("verified"), { activeBanSanctionIds: [42] }),
    ).toBe(false);
  });
});

describe("activeBanSanctionIds", () => {
  it("counts active and started scheduled bans", () => {
    expect(
      activeBanSanctionIds(
        [ban({ id: 3, status: "active" }), ban({ id: 1, status: "scheduled" })],
        NOW,
      ),
    ).toEqual([1, 3]);
  });

  it("ignores revoked and expired bans", () => {
    expect(
      activeBanSanctionIds(
        [ban({ id: 4, status: "revoked" }), ban({ id: 5, status: "expired" })],
        NOW,
      ),
    ).toEqual([]);
  });

  it("ignores bans that have not started or have already ended", () => {
    const notStarted = ban({
      id: 6,
      startsAt: new Date("2026-09-01T00:00:00.000Z"),
    });
    const ended = ban({ id: 7, endsAt: new Date("2026-07-15T00:00:00.000Z") });

    expect(activeBanSanctionIds([notStarted, ended], NOW)).toEqual([]);
  });

  it("treats a ban ending exactly now as over", () => {
    expect(activeBanSanctionIds([ban({ id: 8, endsAt: NOW })], NOW)).toEqual(
      [],
    );
  });
});

describe("resolveBuyerEligibility", () => {
  it("snapshots the evidence behind an active participant decision", () => {
    const { eligibility, snapshot } = resolveBuyerEligibility(
      profile("verified"),
      NO_SANCTIONS,
      NOW,
    );

    expect(eligibility).toBe("active_participant");
    expect(snapshot).toEqual({
      source: "users.status",
      userId: 7,
      status: "verified",
      role: "user",
      hasActiveBanSanction: false,
      activeBanSanctionIds: [],
      evaluatedAt: "2026-08-01T14:22:05.000Z",
      definitionVersion: ELIGIBILITY_DEFINITION_VERSION,
    });
  });

  it("records the disqualifying status for ineligible signed-in users", () => {
    const { eligibility, snapshot } = resolveBuyerEligibility(
      profile("paused"),
      NO_SANCTIONS,
      NOW,
    );

    expect(eligibility).toBe("public");
    expect(snapshot.source).toBe("users.status");
    expect(snapshot.status).toBe("paused");
  });

  it("records which bans demoted a verified profile", () => {
    const { eligibility, snapshot } = resolveBuyerEligibility(
      profile("verified"),
      { activeBanSanctionIds: [12, 30] },
      NOW,
    );

    expect(eligibility).toBe("public");
    expect(snapshot.status).toBe("verified");
    expect(snapshot.hasActiveBanSanction).toBe(true);
    expect(snapshot.activeBanSanctionIds).toEqual([12, 30]);
  });

  it("marks guests without inventing a status", () => {
    const { eligibility, snapshot } = resolveBuyerEligibility(
      null,
      NO_SANCTIONS,
      NOW,
    );

    expect(eligibility).toBe("public");
    expect(snapshot.source).toBe("guest");
    expect(snapshot.userId).toBeNull();
    expect(snapshot.status).toBeNull();
    expect(snapshot.hasActiveBanSanction).toBe(false);
  });
});

describe("canPurchaseAudience", () => {
  const cases: [SessionAudience, boolean, boolean][] = [
    // audience, active participant allowed, public allowed
    ["all", true, true],
    ["participants_only", true, false],
    ["public_only", false, true],
  ];

  it.each(cases)(
    "%s admits participants=%s and public=%s",
    (audience, participantAllowed, publicAllowed) => {
      expect(canPurchaseAudience(audience, "active_participant")).toBe(
        participantAllowed,
      );
      expect(canPurchaseAudience(audience, "public")).toBe(publicAllowed);
    },
  );

  it("keeps a banned buyer out of participant-only sessions", () => {
    const { eligibility } = resolveBuyerEligibility(
      profile("verified"),
      { activeBanSanctionIds: [3] },
      NOW,
    );

    expect(canPurchaseAudience("participants_only", eligibility)).toBe(false);
    expect(canPurchaseAudience("public_only", eligibility)).toBe(true);
  });
});
