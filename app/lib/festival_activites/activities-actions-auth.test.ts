// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const profileMock = vi.hoisted(() => vi.fn());
const dbTouched = vi.hoisted(() => ({ count: 0 }));
const queriesMock = vi.hoisted(() => ({
  fetchActivityParticipationOwnerId: vi.fn(),
  fetchParticipationPreviewDataBatch: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/app/vendors/resend", () => ({ sendEmail: vi.fn() }));
vi.mock("@/app/emails/festival-activity-registration", () => ({
  default: vi.fn(),
}));
vi.mock("@/app/lib/festivals/actions", () => ({ fetchBaseFestival: vi.fn() }));
vi.mock("@/app/lib/users/queries", () => ({ fetchAdminUsers: vi.fn() }));
vi.mock("@/app/lib/uploadthing/storage", () => ({
  attemptStorageCleanupJob: vi.fn(),
  enqueueStorageCleanupJob: vi.fn(),
}));
vi.mock("@/app/lib/festival_activites/queries", () => queriesMock);
vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: profileMock,
  requireAdminOrFestivalAdmin: async () => {
    const profile = await profileMock();
    return profile &&
      (profile.role === "admin" || profile.role === "festival_admin")
      ? profile
      : null;
  },
  requireProfileOwnerOrAdmin: async (profileId: number) => {
    const profile = await profileMock();
    return profile && (profile.id === profileId || profile.role === "admin")
      ? profile
      : null;
  },
}));
// Any database access at all counts: a refused caller must be turned away
// before the first query.
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

import type { BaseProfile } from "@/app/api/users/definitions";
import {
  fetchReservationCollaborationsByFestivalId,
  registerArrival,
  removeArrival,
} from "@/app/lib/collaborators/actions";
import {
  addFestivalActivityParticipantProof,
  addFestivalActivityVote,
  deleteFestivalActivityParticipantProof,
  enrollFromWaitlistInvitation,
  enrollInActivity,
  enrollInBestStandActivity,
  fetchParticipationPreviewData,
  joinActivityWaitlist,
  leaveActivityWaitlist,
} from "@/app/lib/festival_activites/actions";
import type {
  ActivityDetailsWithParticipants,
  FestivalActivity,
} from "@/app/lib/festivals/definitions";
import { signUploadReceipt } from "@/app/lib/uploadthing/upload-receipt";

const OWNER = {
  id: 7,
  role: "user",
  status: "verified",
  category: "illustration",
  clerkId: "user_owner",
};
const OTHER_USER = { ...OWNER, id: 8, clerkId: "user_other" };
const FESTIVAL_ADMIN = { ...OWNER, id: 2, role: "festival_admin" };
const ADMIN = { ...OWNER, id: 1, role: "admin" };

const PROOF_URL = "https://abc123.ufs.sh/f/proof-key";

beforeEach(() => {
  vi.stubEnv("UPLOADTHING_TOKEN", "test-uploadthing-token");
  profileMock.mockReset();
  queriesMock.fetchActivityParticipationOwnerId.mockReset();
  queriesMock.fetchParticipationPreviewDataBatch.mockReset();
  queriesMock.fetchParticipationPreviewDataBatch.mockResolvedValue({});
  dbTouched.count = 0;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// Valid inputs throughout, so an action missing its guard would get past
// validation and reach the database instead of failing for another reason.
const forProfile = { id: OWNER.id } as BaseProfile;
const activityDetail = { id: 3 } as ActivityDetailsWithParticipants;
const activity = { id: 4 } as FestivalActivity;

const OWNER_ACTIONS: [string, () => Promise<unknown>][] = [
  [
    "enrollInActivity",
    () => enrollInActivity(forProfile, 1, activityDetail, activity),
  ],
  [
    "enrollInBestStandActivity",
    () => enrollInBestStandActivity(4, OWNER.id, 1, "illustration"),
  ],
  [
    "addFestivalActivityParticipantProof",
    () =>
      addFestivalActivityParticipantProof(
        5,
        [
          {
            imageUrl: PROOF_URL,
            receipt: signUploadReceipt(
              "festivalActivityParticipantProof",
              OWNER.clerkId,
              PROOF_URL,
            ),
          },
        ],
        OWNER.id,
      ),
  ],
  [
    "deleteFestivalActivityParticipantProof",
    () => deleteFestivalActivityParticipantProof(6, 5, OWNER.id, 1),
  ],
  ["joinActivityWaitlist", () => joinActivityWaitlist(forProfile, 4)],
  ["leaveActivityWaitlist", () => leaveActivityWaitlist(OWNER.id, 4)],
  [
    "enrollFromWaitlistInvitation",
    () => enrollFromWaitlistInvitation(OWNER.id, 9, 1),
  ],
];

describe.each([
  ["a signed-out visitor", null],
  ["another participant", OTHER_USER],
  ["a festival admin", FESTIVAL_ADMIN],
])("participant self-service actions called by %s", (_, profile) => {
  beforeEach(() => {
    profileMock.mockResolvedValue(profile);
  });

  it.each(OWNER_ACTIONS)("%s is refused before any query", async (_n, call) => {
    const result = await call();

    expect(result).toMatchObject({ success: false });
    expect(dbTouched.count).toBe(0);
  });

  it("fetchParticipationPreviewData returns nothing", async () => {
    queriesMock.fetchActivityParticipationOwnerId.mockResolvedValue(OWNER.id);

    // A festival admin is staff and may read it; the others may not.
    const result = await fetchParticipationPreviewData(5);

    if (profile?.role === "festival_admin") {
      expect(queriesMock.fetchParticipationPreviewDataBatch).toHaveBeenCalled();
    } else {
      expect(result).toBeNull();
      expect(
        queriesMock.fetchParticipationPreviewDataBatch,
      ).not.toHaveBeenCalled();
    }
    expect(dbTouched.count).toBe(0);
  });
});

describe("collaborator check-in actions", () => {
  describe.each([
    ["a signed-out visitor", null],
    ["a participant", OWNER],
  ])("called by %s", (_, profile) => {
    beforeEach(() => {
      profileMock.mockResolvedValue(profile);
    });

    it("lists no collaborators", async () => {
      expect(await fetchReservationCollaborationsByFestivalId(1)).toEqual([]);
      expect(dbTouched.count).toBe(0);
    });

    it.each([
      ["registerArrival", () => registerArrival(1, 1)],
      ["removeArrival", () => removeArrival(1)],
    ])("%s is refused before any query", async (_n, call) => {
      expect(await call()).toMatchObject({
        success: false,
        message: "No autorizado",
      });
      expect(dbTouched.count).toBe(0);
    });
  });

  it("admits a festival admin", async () => {
    profileMock.mockResolvedValue(FESTIVAL_ADMIN);

    await registerArrival(1, 1);

    expect(dbTouched.count).toBeGreaterThan(0);
  });
});

describe("addFestivalActivityVote", () => {
  const standVote = {
    activityVariantId: 3,
    votableType: "stand",
    standId: 11,
  } as const;

  it("refuses a signed-out visitor without throwing", async () => {
    profileMock.mockResolvedValue(null);

    expect(await addFestivalActivityVote(standVote)).toMatchObject({
      success: false,
    });
    expect(dbTouched.count).toBe(0);
  });

  it("refuses an unverified profile", async () => {
    profileMock.mockResolvedValue({ ...OWNER, status: "pending" });

    expect(await addFestivalActivityVote(standVote)).toMatchObject({
      success: false,
    });
    expect(dbTouched.count).toBe(0);
  });

  it("refuses a vote with no valid target", async () => {
    profileMock.mockResolvedValue(OWNER);

    const forged = {
      activityVariantId: 3,
      votableType: "stand",
      participantId: 12,
    } as unknown as Parameters<typeof addFestivalActivityVote>[0];

    expect(await addFestivalActivityVote(forged)).toMatchObject({
      success: false,
    });
    expect(dbTouched.count).toBe(0);
  });
});

describe("addFestivalActivityParticipantProof receipts", () => {
  beforeEach(() => {
    profileMock.mockResolvedValue(OWNER);
  });

  it.each([
    ["no receipt", () => undefined],
    ["a forged receipt", () => "not-a-receipt"],
    [
      "another uploader's receipt",
      () =>
        signUploadReceipt(
          "festivalActivityParticipantProof",
          OTHER_USER.clerkId,
          PROOF_URL,
        ),
    ],
    [
      "a receipt from another upload route",
      () => signUploadReceipt("imageUploader", OWNER.clerkId, PROOF_URL),
    ],
    [
      "a receipt for another URL",
      () =>
        signUploadReceipt(
          "festivalActivityParticipantProof",
          OWNER.clerkId,
          "https://abc123.ufs.sh/f/other-key",
        ),
    ],
  ])("refuses a URL with %s before any query", async (_, receipt) => {
    const result = await addFestivalActivityParticipantProof(
      5,
      [{ imageUrl: PROOF_URL, receipt: receipt() as string }],
      OWNER.id,
    );

    expect(result).toMatchObject({ success: false });
    expect(dbTouched.count).toBe(0);
  });

  it("lets the owner's own signed upload through to the database", async () => {
    await addFestivalActivityParticipantProof(
      5,
      [
        {
          imageUrl: PROOF_URL,
          receipt: signUploadReceipt(
            "festivalActivityParticipantProof",
            OWNER.clerkId,
            PROOF_URL,
          ),
        },
      ],
      OWNER.id,
    ).catch(() => undefined);

    expect(dbTouched.count).toBeGreaterThan(0);
  });
});

describe("leaveActivityWaitlist", () => {
  it("admits an admin acting from the owner's profile page", async () => {
    profileMock.mockResolvedValue(ADMIN);

    await leaveActivityWaitlist(OWNER.id, 4);

    expect(dbTouched.count).toBeGreaterThan(0);
  });
});

describe("fetchParticipationPreviewData", () => {
  it("returns the owner's own participation", async () => {
    profileMock.mockResolvedValue(OWNER);
    queriesMock.fetchActivityParticipationOwnerId.mockResolvedValue(OWNER.id);
    const preview = {
      imageUrl: null,
      participantName: "Demo",
      standLabels: ["A1"],
      sectorName: null,
    };
    queriesMock.fetchParticipationPreviewDataBatch.mockResolvedValue({
      5: preview,
    });

    expect(await fetchParticipationPreviewData(5)).toEqual(preview);
  });
});
