// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const profileMock = vi.hoisted(() => vi.fn());
const clerkUserMock = vi.hoisted(() => vi.fn());
const dbTouched = vi.hoisted(() => ({ count: 0 }));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/lib/users/helpers", () => {
  const isStaff = (profile: { role?: string } | null) =>
    profile?.role === "admin" || profile?.role === "festival_admin";
  return {
    getCurrentUserProfile: profileMock,
    requireAdmin: async () => {
      const profile = await profileMock();
      return profile?.role === "admin" ? profile : null;
    },
    requireAdminOrFestivalAdmin: async () => {
      const profile = await profileMock();
      return isStaff(profile) ? profile : null;
    },
    requireProfileOwnerOrAdmin: async (profileId: number) => {
      const profile = await profileMock();
      return profile && (profile.id === profileId || profile.role === "admin")
        ? profile
        : null;
    },
    requireProfileOwnerOrStaff: async (profileId: number) => {
      const profile = await profileMock();
      return profile && (profile.id === profileId || isStaff(profile))
        ? profile
        : null;
    },
    // Builds the filter for the profile queries, so reaching it means the
    // caller already got past where the gate should have stopped them.
    buildWhereClauseForProfileFetching: async () => {
      dbTouched.count += 1;
      throw new Error("filter built");
    },
  };
});
// Any database access at all fails the test: a refused caller must be turned
// away before the first query.
vi.mock("@/db", () => ({
  db: new Proxy(
    {},
    {
      get() {
        dbTouched.count += 1;
        throw new Error("database touched");
      },
    },
  ),
}));
vi.mock("@/app/lib/users/queries", () => {
  const touch = async () => {
    dbTouched.count += 1;
    throw new Error("database touched");
  };
  return {
    getCurrentClerkUser: clerkUserMock,
    fetchAdminUsers: touch,
    fetchUserProfileById: touch,
  };
});
// Collaborators that read the server env at import time, which a unit test
// does not have. None of them can run before the gate anyway.
vi.mock("@/app/vendors/resend", () => ({ sendEmail: vi.fn() }));
vi.mock("@/app/server/uploadthing", () => ({ utapi: {} }));
vi.mock("@/app/lib/posthog-server", () => ({
  getPostHogClient: vi.fn(),
  POSTHOG_SHUTDOWN_TIMEOUT_MS: 1,
}));
vi.mock("@/app/lib/user_requests/review-service", () => ({
  reviewFestivalParticipationRequest: vi.fn(),
  reviewBecomeArtistRequest: vi.fn(),
}));
vi.mock("@/app/lib/reservations/capacity-service", () => ({
  createExternalParticipantReservation: vi.fn(),
}));
vi.mock("@/app/lib/festivals/queries", () => ({ fetchFestival: vi.fn() }));
vi.mock("@/app/lib/uploadthing/storage", () => ({ deleteStoredFile: vi.fn() }));
vi.mock("@/app/lib/infractions/notifications", () => ({
  scrubDisciplinaryNotificationJobsForUser: vi.fn(),
}));
vi.mock("@/app/lib/programs/anonymization", () => ({
  anonymizeProgramPurchasesForUser: vi.fn(),
}));
vi.mock("@/app/lib/users/clerk", () => ({ deleteClerkUser: vi.fn() }));

import * as userRequestActions from "@/app/api/user_requests/actions";
import * as apiUserActions from "@/app/api/users/actions";
import { fetchExternalParticipants } from "@/app/lib/external_participants/actions";
import * as participantActions from "@/app/lib/participants/actions";
import { fetchParticipationInFestival } from "@/app/lib/participations/actions";
import * as userActions from "@/app/lib/users/actions";

const OWNER_ID = 7;
const PARTICIPANT = {
  id: 5,
  role: "user",
  category: "illustration",
  profileSubcategories: [{ subcategoryId: 1 }],
};
const FESTIVAL_ADMIN = {
  id: 9,
  role: "festival_admin",
  category: "none",
  profileSubcategories: [],
};
const ADMIN = {
  id: 1,
  role: "admin",
  category: "none",
  profileSubcategories: [],
};
/** OWNER_ID itself, still choosing its category. */
const ONBOARDING_OWNER = {
  id: OWNER_ID,
  role: "user",
  category: "none",
  profileSubcategories: [],
};
const UNAUTHORIZED = { success: false, message: "No autorizado" };

// Valid inputs throughout, so an action missing its guard would get past
// validation and reach the database instead of failing for another reason.
const profileListFilters = {
  limit: 10,
  offset: 0,
  sort: "id" as const,
  direction: "asc" as const,
  profileCompletion: "all" as const,
};

/** Reads only staff may run. Each answers with its empty value. */
const STAFF_READS: [string, () => Promise<unknown>, unknown][] = [
  [
    "fetchRequestsByUserId",
    () => userRequestActions.fetchRequestsByUserId(OWNER_ID),
    [],
  ],
  [
    "fetchFestivalParticipationRequests",
    () => userRequestActions.fetchFestivalParticipationRequests(1),
    [],
  ],
  ["fetchRequests", () => userRequestActions.fetchRequests(), []],
  ["fetchProfiles", () => apiUserActions.fetchProfiles(), []],
  [
    "fetchUserProfiles",
    () => userActions.fetchUserProfiles(profileListFilters),
    [],
  ],
  [
    "fetchUsersAggregates",
    () => userActions.fetchUsersAggregates({ query: "ana@example.com" }),
    { total: 0 },
  ],
  [
    "fetchParticipantProfiles",
    () => participantActions.fetchParticipantProfiles(profileListFilters),
    [],
  ],
  [
    "fetchParticipantAggregates",
    () =>
      participantActions.fetchParticipantAggregates({
        query: "70000000",
        profileCompletion: "all",
      }),
    {
      total: 0,
      active: 0,
      paused: 0,
      banned: 0,
      totalParticipants: 0,
      pauseEligible: 0,
    },
  ],
  [
    "fetchParticipantActivitySummary",
    () => participantActions.fetchParticipantActivitySummary(OWNER_ID),
    null,
  ],
  ["fetchExternalParticipants", () => fetchExternalParticipants(), []],
];

/** Calls aimed at profile OWNER_ID, which neither caller below owns. */
const OWNER_CALLS: [string, () => Promise<unknown>, unknown][] = [
  [
    "createUserEnrollment",
    () =>
      userRequestActions.createUserEnrollment({
        profileId: OWNER_ID,
        festivalId: 1,
      }),
    UNAUTHORIZED,
  ],
  [
    "fetchUserParticipations",
    () => userActions.fetchUserParticipations(OWNER_ID),
    [],
  ],
  [
    "fetchParticipationInFestival",
    () => fetchParticipationInFestival(OWNER_ID, 1),
    null,
  ],
  [
    "updateProfileCategories",
    () => userActions.updateProfileCategories(OWNER_ID, "illustration", [1]),
    UNAUTHORIZED,
  ],
];

beforeEach(() => {
  profileMock.mockReset();
  clerkUserMock.mockReset();
  dbTouched.count = 0;
});

describe.each([
  ["a signed-out visitor", null],
  ["a participant", PARTICIPANT],
])("identity actions called by %s", (_, profile) => {
  beforeEach(() => {
    profileMock.mockResolvedValue(profile);
  });

  it.each(STAFF_READS)(
    "%s is refused before any query",
    async (_name, call, empty) => {
      await expect(call()).resolves.toEqual(empty);
      expect(dbTouched.count).toBe(0);
    },
  );

  it.each(OWNER_CALLS)(
    "%s on someone else's profile is refused before any query",
    async (_name, call, refusal) => {
      await expect(call()).resolves.toEqual(refusal);
      expect(dbTouched.count).toBe(0);
    },
  );
});

describe("narrower gates", () => {
  it("keeps the all-requests list to admins", async () => {
    profileMock.mockResolvedValue(FESTIVAL_ADMIN);

    await expect(userRequestActions.fetchRequests()).resolves.toEqual([]);
    expect(dbTouched.count).toBe(0);
  });

  it("does not let a festival admin accept terms for a participant", async () => {
    profileMock.mockResolvedValue(FESTIVAL_ADMIN);

    await expect(
      userRequestActions.createUserEnrollment({
        profileId: OWNER_ID,
        festivalId: 1,
      }),
    ).resolves.toEqual(UNAUTHORIZED);
    expect(dbTouched.count).toBe(0);
  });

  it("does not let an owner recategorize a profile that is already complete", async () => {
    profileMock.mockResolvedValue({ ...PARTICIPANT, id: OWNER_ID });

    await expect(
      userActions.updateProfileCategories(OWNER_ID, "gastronomy", [3]),
    ).resolves.toEqual(UNAUTHORIZED);
    expect(dbTouched.count).toBe(0);
  });

  it.each([
    ["no subcategories", "illustration", []],
    ["the deprecated new_artist area", "new_artist", [1]],
  ])(
    "does not let an onboarding owner save a pick with %s",
    async (_, category, ids) => {
      profileMock.mockResolvedValue(ONBOARDING_OWNER);

      await expect(
        userActions.updateProfileCategories(
          OWNER_ID,
          category as never,
          ids as number[],
        ),
      ).resolves.toEqual(UNAUTHORIZED);
      expect(dbTouched.count).toBe(0);
    },
  );

  it("refuses to create a profile without a Clerk session", async () => {
    clerkUserMock.mockResolvedValue(null);

    await expect(userActions.createUserProfile()).resolves.toEqual(
      UNAUTHORIZED,
    );
    expect(dbTouched.count).toBe(0);
  });
});

// The other side of each gate: a caller it admits gets as far as the query,
// so a guard that turned everyone away would fail here.
describe("allowed callers reach the query", () => {
  /** Runs `call`, whose query throws here, and reports whether it got there. */
  async function reachedQuery(call: () => Promise<unknown>) {
    await call().catch(() => undefined);
    return dbTouched.count > 0;
  }

  it.each(STAFF_READS)("%s runs for an admin", async (_name, call) => {
    profileMock.mockResolvedValue(ADMIN);

    expect(await reachedQuery(call)).toBe(true);
  });

  it.each(STAFF_READS.filter(([name]) => name !== "fetchRequests"))(
    "%s runs for a festival admin",
    async (_name, call) => {
      profileMock.mockResolvedValue(FESTIVAL_ADMIN);

      expect(await reachedQuery(call)).toBe(true);
    },
  );

  it.each(OWNER_CALLS)(
    "%s runs for the profile's owner",
    async (_name, call) => {
      profileMock.mockResolvedValue(ONBOARDING_OWNER);

      expect(await reachedQuery(call)).toBe(true);
    },
  );

  it.each(OWNER_CALLS)(
    "%s runs for an admin acting on someone else's profile",
    async (_name, call) => {
      profileMock.mockResolvedValue(ADMIN);

      expect(await reachedQuery(call)).toBe(true);
    },
  );

  it.each([
    [
      "fetchParticipationInFestival",
      () => fetchParticipationInFestival(OWNER_ID, 1),
    ],
    [
      "updateProfileCategories",
      () => userActions.updateProfileCategories(OWNER_ID, "illustration", [1]),
    ],
  ])(
    "%s runs for a festival admin acting on someone else's profile",
    async (_name, call) => {
      profileMock.mockResolvedValue(FESTIVAL_ADMIN);

      expect(await reachedQuery(call)).toBe(true);
    },
  );
});

describe("server-only lookups are not server actions", () => {
  // Every export of a "use server" module can be POSTed to directly, so none
  // of these unguarded lookups may be exported from one.
  it.each([
    "fetchUserProfileById",
    "fetchUserProfile",
    "fetchOrCreateProfile",
    "fetchProfilesByIds",
    "fetchAdminUsers",
    "fetchBaseProfileById",
    "fetchBaseProfileByClerkId",
  ])("app/api/users/actions does not export %s", (name) => {
    expect(apiUserActions).not.toHaveProperty(name);
  });

  it.each([
    "getCurrentClerkUser",
    "fetchUserProfileByClerkId",
    "cachedFetchUserProfileByClerkId",
    "fetchBaseUserProfileByClerkId",
    "cachedFetchBaseUserProfileByClerkId",
    "fetchUserProfilesByEmails",
    "fetchUserInfractions",
  ])("app/lib/users/actions does not export %s", (name) => {
    expect(userActions).not.toHaveProperty(name);
  });

  it("app/lib/participants/actions does not export fetchParticipantProfileById", () => {
    expect(participantActions).not.toHaveProperty(
      "fetchParticipantProfileById",
    );
  });
});
