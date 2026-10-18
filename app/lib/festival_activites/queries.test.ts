// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const profileMock = vi.hoisted(() => vi.fn());
const findFirstMock = vi.hoisted(() => vi.fn());
const dbTouched = vi.hoisted(() => ({ count: 0 }));

vi.mock("server-only", () => ({}));
vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: profileMock,
  requireAdminOrFestivalAdmin: async () => {
    const profile = await profileMock();
    return profile &&
      (profile.role === "admin" || profile.role === "festival_admin")
      ? profile
      : null;
  },
}));
// Counts every database access, so a refused caller can be shown to have been
// turned away before the first query.
vi.mock("@/db", () => ({
  db: new Proxy(
    {},
    {
      get(_target, prop) {
        dbTouched.count += 1;
        if (prop === "query") {
          return { festivalActivities: { findFirst: findFirstMock } };
        }
        throw new Error(`unexpected db.${String(prop)}`);
      },
    },
  ),
}));

import {
  fetchFestivalActivity,
  fetchFestivalActivityForStaff,
} from "@/app/lib/festival_activites/queries";

const VIEWER = { id: 7, role: "user", status: "verified" };
const OTHER = 30;
const FESTIVAL_ADMIN = { ...VIEWER, id: 2, role: "festival_admin" };
const ADMIN = { ...VIEWER, id: 1, role: "admin" };

function proof(participationId: number) {
  return {
    id: participationId * 10,
    participationId,
    imageUrl: `https://abc123.ufs.sh/f/${participationId}`,
    proofStatus: "rejected_resubmit",
    adminFeedback: "Feedback privado",
    promoHighlight: "2x1",
    promoDescription: "Promo sin publicar",
    promoConditions: "Condiciones",
  };
}

function participant(id: number, userId: number) {
  return {
    id,
    userId,
    detailsId: 3,
    removedAt: null,
    removalReason: "Motivo interno",
    user: { id: userId, displayName: `Perfil ${userId}` },
    proofs: [proof(id)],
  };
}

function storedActivity() {
  return {
    id: 4,
    festivalId: 1,
    details: [
      {
        id: 3,
        participants: [participant(50, VIEWER.id), participant(51, OTHER)],
        votes: [
          { id: 1, voterId: VIEWER.id, participantId: 51 },
          { id: 2, voterId: OTHER, participantId: 50 },
        ],
      },
    ],
    waitlistEntries: [
      { id: 8, userId: VIEWER.id, position: 2 },
      { id: 9, userId: OTHER, position: 1 },
    ],
  };
}

beforeEach(() => {
  profileMock.mockReset();
  findFirstMock.mockReset();
  findFirstMock.mockResolvedValue(storedActivity());
  dbTouched.count = 0;
});

describe("fetchFestivalActivityForStaff", () => {
  it.each([
    ["a signed-out visitor", null],
    ["a participant", VIEWER],
  ])("returns nothing to %s before any query", async (_, profile) => {
    profileMock.mockResolvedValue(profile);

    expect(await fetchFestivalActivityForStaff(4)).toBeNull();
    expect(dbTouched.count).toBe(0);
  });

  it.each([
    ["a festival admin", FESTIVAL_ADMIN],
    ["an admin", ADMIN],
  ])("returns the whole activity to %s", async (_, profile) => {
    profileMock.mockResolvedValue(profile);

    expect(await fetchFestivalActivityForStaff(4)).toEqual(storedActivity());
  });
});

describe("fetchFestivalActivity", () => {
  it("gives a participant only their own votes, waitlist entry and feedback", async () => {
    profileMock.mockResolvedValue(VIEWER);

    const activity = await fetchFestivalActivity(4);
    const [detail] = activity!.details;
    const [own, other] = detail.participants;

    expect(detail.votes).toEqual([
      { id: 1, voterId: VIEWER.id, participantId: 51 },
    ]);
    expect(activity!.waitlistEntries).toEqual([
      { id: 8, userId: VIEWER.id, position: 2 },
    ]);
    expect(own).toEqual(participant(50, VIEWER.id));
    // Others keep what the enrollment and voting pages list.
    expect(other).toMatchObject({
      id: 51,
      userId: OTHER,
      removedAt: null,
      removalReason: null,
      user: { id: OTHER, displayName: `Perfil ${OTHER}` },
    });
    expect(other.proofs).toEqual([
      {
        ...proof(51),
        adminFeedback: null,
        promoHighlight: null,
        promoDescription: null,
        promoConditions: null,
      },
    ]);
  });

  it("gives a signed-out caller nobody's votes or waitlist entries", async () => {
    profileMock.mockResolvedValue(null);

    const activity = await fetchFestivalActivity(4);

    expect(activity!.details[0].votes).toEqual([]);
    expect(activity!.waitlistEntries).toEqual([]);
    expect(activity!.details[0].participants[0].proofs[0].adminFeedback).toBe(
      null,
    );
  });

  it.each([
    ["a festival admin", FESTIVAL_ADMIN],
    ["an admin", ADMIN],
  ])("gives %s the whole activity", async (_, profile) => {
    profileMock.mockResolvedValue(profile);

    expect(await fetchFestivalActivity(4)).toEqual(storedActivity());
  });

  it("returns null for a missing activity", async () => {
    profileMock.mockResolvedValue(VIEWER);
    findFirstMock.mockResolvedValue(undefined);

    expect(await fetchFestivalActivity(4)).toBeNull();
  });
});
