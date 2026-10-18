import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/app/lib/user_requests/review-service", () => ({
  reviewFestivalParticipationRequest: vi.fn(),
  reviewBecomeArtistRequest: vi.fn(),
}));

const currentProfileMock = vi.hoisted(() => vi.fn());
const requireAdminMock = vi.hoisted(() => vi.fn());
const requireAdminOrFestivalAdminMock = vi.hoisted(() => vi.fn());
const findFirstUserMock = vi.hoisted(() => vi.fn());
const findFirstFestivalMock = vi.hoisted(() => vi.fn());
const findFirstRequestMock = vi.hoisted(() => vi.fn());
const insertValuesMock = vi.hoisted(() => vi.fn());
const updateMock = vi.hoisted(() => vi.fn());
const publishedTermsMock = vi.hoisted(() => vi.fn());
const fetchAdminUsersMock = vi.hoisted(() => vi.fn());
const sendEmailMock = vi.hoisted(() => vi.fn());
const termsEmailMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: currentProfileMock,
  requireAdmin: requireAdminMock,
  requireAdminOrFestivalAdmin: requireAdminOrFestivalAdminMock,
  // Same rule as the real gate, over the mocked session profile.
  requireProfileOwnerOrAdmin: async (profileId: number) => {
    const profile = await currentProfileMock();
    return profile && (profile.id === profileId || profile.role === "admin")
      ? profile
      : null;
  },
}));

vi.mock("@/app/lib/reservations/policy", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/app/lib/reservations/policy")>();
  return {
    ...actual,
    canMutateAdminReservations: (actor: { role?: string } | null) =>
      actor?.role === "admin",
  };
});

vi.mock("@/app/lib/users/queries", () => ({
  fetchAdminUsers: fetchAdminUsersMock,
}));

vi.mock("@/app/lib/festival-terms/queries", () => ({
  fetchPublishedFestivalTermsVersion: publishedTermsMock,
}));

vi.mock("@/app/vendors/resend", () => ({
  sendEmail: sendEmailMock,
}));

vi.mock("@/app/emails/terms-acceptance", () => ({
  default: termsEmailMock,
}));

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(),
    insert: vi.fn(() => ({ values: insertValuesMock })),
    update: updateMock,
    query: {
      users: { findFirst: findFirstUserMock },
      festivals: { findFirst: findFirstFestivalMock },
      userRequests: { findFirst: findFirstRequestMock, findMany: vi.fn() },
    },
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import * as userRequestActions from "@/app/api/user_requests/actions";

describe("reservation mutation exposure", () => {
  it("does not expose the obsolete reservation mutation actions", () => {
    expect(userRequestActions).not.toHaveProperty("createReservation");
    expect(userRequestActions).not.toHaveProperty("updateReservation");
    expect(userRequestActions).not.toHaveProperty("updateReservationSimple");
    expect(userRequestActions).not.toHaveProperty("updateUserRequest");
  });
});

describe("createUserEnrollment", () => {
  const PARTICIPANT_ID = 7;
  const FESTIVAL_ID = 3;
  const TERMS_VERSION_ID = 11;
  const params = { profileId: PARTICIPANT_ID, festivalId: FESTIVAL_ID };

  const participantRow = {
    id: PARTICIPANT_ID,
    status: "verified",
    category: "illustration",
    displayName: "Ana Dibuja",
  };
  const activeFestival = {
    participantTermsEnabled: true,
    name: "Glitter Primavera",
    reservationsStartDate: new Date("2026-11-01T00:00:00Z"),
    status: "active",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    findFirstUserMock.mockResolvedValue(participantRow);
    findFirstFestivalMock.mockResolvedValue(activeFestival);
    findFirstRequestMock.mockResolvedValue(undefined);
    publishedTermsMock.mockResolvedValue({ id: TERMS_VERSION_ID });
    insertValuesMock.mockResolvedValue(undefined);
    fetchAdminUsersMock.mockResolvedValue([{ email: "admin@example.com" }]);
    sendEmailMock.mockResolvedValue(undefined);
  });

  it("enrolls the profile's owner", async () => {
    currentProfileMock.mockResolvedValue({ id: PARTICIPANT_ID, role: "user" });

    await expect(
      userRequestActions.createUserEnrollment(params),
    ).resolves.toEqual({
      success: true,
      message: "Ya estás habilitado para participar.",
    });
    expect(insertValuesMock).toHaveBeenCalledWith({
      userId: PARTICIPANT_ID,
      festivalId: FESTIVAL_ID,
      status: "accepted",
      type: "festival_participation",
      termsVersionId: TERMS_VERSION_ID,
    });
  });

  it("lets an admin accept the terms on a participant's behalf", async () => {
    currentProfileMock.mockResolvedValue({ id: 1, role: "admin" });

    await expect(
      userRequestActions.createUserEnrollment(params),
    ).resolves.toMatchObject({ success: true });
    // The request is the participant's, not the admin's.
    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: PARTICIPANT_ID }),
    );
  });

  it("does not let a festival admin accept the terms for a participant", async () => {
    currentProfileMock.mockResolvedValue({ id: 9, role: "festival_admin" });

    await expect(
      userRequestActions.createUserEnrollment(params),
    ).resolves.toEqual({ success: false, message: "No autorizado" });
    expect(findFirstUserMock).not.toHaveBeenCalled();
    expect(insertValuesMock).not.toHaveBeenCalled();
  });

  it.each(["draft", "published", "archived"])(
    "refuses while the festival is %s",
    async (status) => {
      currentProfileMock.mockResolvedValue({
        id: PARTICIPANT_ID,
        role: "user",
      });
      findFirstFestivalMock.mockResolvedValue({ ...activeFestival, status });

      await expect(
        userRequestActions.createUserEnrollment(params),
      ).resolves.toEqual({
        success: false,
        message: "El festival aún no tiene las reservas activas",
      });
      expect(insertValuesMock).not.toHaveBeenCalled();
      expect(sendEmailMock).not.toHaveBeenCalled();
    },
  );

  it("builds the admin email from the stored profile and festival", async () => {
    currentProfileMock.mockResolvedValue({ id: PARTICIPANT_ID, role: "user" });

    await userRequestActions.createUserEnrollment(params);

    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["admin@example.com"],
        subject: "Ana Dibuja se ha inscrito a Glitter Primavera",
      }),
    );
    expect(termsEmailMock).toHaveBeenCalledWith({
      profile: {
        id: PARTICIPANT_ID,
        displayName: "Ana Dibuja",
        category: "illustration",
      },
      festival: {
        id: FESTIVAL_ID,
        name: "Glitter Primavera",
        reservationsStartDate: activeFestival.reservationsStartDate,
      },
    });
  });
});
