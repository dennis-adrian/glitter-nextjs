import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const currentClerkUserMock = vi.hoisted(() => vi.fn());
const fetchProfileByClerkIdMock = vi.hoisted(() => vi.fn());
const transactionMock = vi.hoisted(() => vi.fn());
const updateStatusWithAuditMock = vi.hoisted(() => vi.fn());
const sendEmailMock = vi.hoisted(() => vi.fn());

// `requireAdmin` itself stays real: only the Clerk session and the profile
// lookup behind it are faked, so these tests exercise the actual gate.
vi.mock("@/app/lib/users/queries", () => ({
  getCurrentClerkUser: currentClerkUserMock,
  cachedFetchUserProfileByClerkId: fetchProfileByClerkIdMock,
  cachedFetchBaseUserProfileByClerkId: vi.fn(),
}));

vi.mock("@/app/lib/users/navbar-profile", () => ({
  cachedFetchNavbarProfileByClerkId: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    transaction: transactionMock,
    select: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    insert: vi.fn(),
    query: {
      users: { findFirst: vi.fn(), findMany: vi.fn() },
    },
  },
}));

vi.mock("@/app/lib/users/status-events", () => ({
  logUserStatusEvent: vi.fn(),
  updateUserStatusWithAudit: updateStatusWithAuditMock,
  verificationReasonForStatus: () => "Verificación manual por administrador.",
}));

vi.mock("@/app/vendors/resend", () => ({ sendEmail: sendEmailMock }));
vi.mock("@/app/emails/verification_confimation/email-template", () => ({
  default: vi.fn(),
}));
vi.mock("@/app/emails/profile-rejection", () => ({ default: vi.fn() }));
vi.mock("@/app/lib/festivals/queries", () => ({
  fetchFestival: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/app/lib/festivals/utils", () => ({
  getFestivalAvaibleStandsByCategory: () => [],
  getFestivalCategories: () => [],
}));
vi.mock("@/app/lib/infractions/notifications", () => ({
  scrubDisciplinaryNotificationJobsForUser: vi.fn(),
}));
vi.mock("@/app/lib/programs/anonymization", () => ({
  anonymizeProgramPurchasesForUser: vi.fn(),
}));
vi.mock("@/app/lib/users/clerk", () => ({ deleteClerkUser: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  deleteProfile,
  disableProfile,
  rejectProfile,
  verifyProfile,
} from "@/app/api/users/actions";

const ADMIN = { id: 1, role: "admin" };
const FESTIVAL_ADMIN = { id: 2, role: "festival_admin" };
const PARTICIPANT = { id: 7, role: "artist" };
const TARGET = { id: 7, status: "pending", email: "ana@example.com" };
const UNAUTHORIZED = { success: false, message: "No autorizado" };

const REJECTED_SEND = {
  data: null,
  error: {
    name: "validation_error",
    statusCode: 422,
    message: "Invalid `to` field.",
  },
  headers: null,
};

function signedInAs(profile: unknown) {
  currentClerkUserMock.mockResolvedValue({ id: "clerk_1" });
  fetchProfileByClerkIdMock.mockResolvedValue(profile);
}

beforeEach(() => {
  currentClerkUserMock.mockReset();
  fetchProfileByClerkIdMock.mockReset();
  transactionMock.mockReset();
  updateStatusWithAuditMock.mockReset();
  sendEmailMock.mockReset();
  sendEmailMock.mockResolvedValue({
    data: { id: "email-1" },
    error: null,
    headers: null,
  });
});

describe.each([
  ["verifyProfile", () => verifyProfile(TARGET.id, "illustrator")],
  ["disableProfile", () => disableProfile(TARGET.id)],
  ["rejectProfile", () => rejectProfile(TARGET as never, "Perfil incompleto")],
  [
    "deleteProfile",
    () => deleteProfile(TARGET.id, { success: false, message: "" }),
  ],
] as const)("%s authorization", (_name, run) => {
  it("refuses an unauthenticated caller", async () => {
    currentClerkUserMock.mockResolvedValue(null);

    await expect(run()).resolves.toEqual(UNAUTHORIZED);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("refuses a festival admin, who reaches the dashboard but is not an admin", async () => {
    signedInAs(FESTIVAL_ADMIN);

    await expect(run()).resolves.toEqual(UNAUTHORIZED);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("refuses a participant acting on its own row", async () => {
    signedInAs(PARTICIPANT);

    await expect(run()).resolves.toEqual(UNAUTHORIZED);
    expect(transactionMock).not.toHaveBeenCalled();
  });
});

describe("verifyProfile as an admin", () => {
  beforeEach(() => {
    signedInAs(ADMIN);
    transactionMock.mockImplementation(
      async (callback: (tx: unknown) => unknown) =>
        callback({
          query: { users: { findFirst: vi.fn().mockResolvedValue(TARGET) } },
          select: () => ({
            from: () => ({
              where: () => ({
                limit: () =>
                  Promise.resolve([
                    { ...TARGET, status: "verified", category: "illustrator" },
                  ]),
              }),
            }),
          }),
        }),
    );
  });

  it("verifies the profile and audits it under the acting admin", async () => {
    await expect(verifyProfile(TARGET.id, "illustrator")).resolves.toEqual({
      success: true,
      message: "Perfil verificado",
    });

    expect(updateStatusWithAuditMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: TARGET.id,
        toStatus: "verified",
        createdByUserId: ADMIN.id,
      }),
    );
    expect(sendEmailMock).toHaveBeenCalled();
  });

  // The verification is committed before the email goes out; reporting it as
  // failed would send the admin to retry something already done.
  it.each([
    ["rejected", () => sendEmailMock.mockResolvedValue(REJECTED_SEND)],
    [
      "timed out",
      () =>
        sendEmailMock.mockRejectedValue(new Error("Resend request timed out")),
    ],
  ])("still reports success when the email is %s", async (_, failSend) => {
    failSend();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await expect(verifyProfile(TARGET.id, "illustrator")).resolves.toEqual({
      success: true,
      message: "Perfil verificado",
    });
    expect(consoleError).toHaveBeenCalledWith(
      "Error sending profile verification email",
      expect.any(Error),
    );
    consoleError.mockRestore();
  });
});

describe("disableProfile as an admin", () => {
  it("bans the profile and records who did it", async () => {
    signedInAs(ADMIN);
    transactionMock.mockImplementation(
      async (callback: (tx: unknown) => unknown) =>
        callback({
          query: { users: { findFirst: vi.fn().mockResolvedValue(TARGET) } },
        }),
    );

    await expect(disableProfile(TARGET.id)).resolves.toMatchObject({
      success: true,
    });
    expect(updateStatusWithAuditMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        toStatus: "banned",
        createdByUserId: ADMIN.id,
      }),
    );
  });
});

describe("rejectProfile as an admin", () => {
  it("rejects the profile and records who did it", async () => {
    signedInAs(ADMIN);
    transactionMock.mockImplementation(
      async (callback: (tx: unknown) => unknown) =>
        callback({
          query: { users: { findFirst: vi.fn().mockResolvedValue(TARGET) } },
        }),
    );

    await expect(
      rejectProfile(TARGET as never, "Perfil incompleto"),
    ).resolves.toMatchObject({ success: true });
    expect(updateStatusWithAuditMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        fromStatus: "pending",
        toStatus: "rejected",
        reason: "Perfil incompleto",
        createdByUserId: ADMIN.id,
      }),
    );
  });

  it("still reports the rejection when its email is rejected", async () => {
    signedInAs(ADMIN);
    transactionMock.mockImplementation(
      async (callback: (tx: unknown) => unknown) =>
        callback({
          query: { users: { findFirst: vi.fn().mockResolvedValue(TARGET) } },
        }),
    );
    sendEmailMock.mockResolvedValue(REJECTED_SEND);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await expect(
      rejectProfile(TARGET as never, "Perfil incompleto"),
    ).resolves.toMatchObject({ success: true });
    expect(consoleError).toHaveBeenCalledWith(
      "Error sending profile rejection email",
      expect.any(Error),
    );
    consoleError.mockRestore();
  });

  it.each(["verified", "paused", "banned", "rejected"] as const)(
    "refuses a %s profile without touching it or emailing it",
    async (status) => {
      signedInAs(ADMIN);
      transactionMock.mockImplementation(
        async (callback: (tx: unknown) => unknown) =>
          callback({
            query: {
              users: {
                findFirst: vi.fn().mockResolvedValue({ ...TARGET, status }),
              },
            },
          }),
      );

      await expect(
        rejectProfile(TARGET as never, "Perfil incompleto"),
      ).resolves.toEqual({
        success: false,
        message: "Solo se pueden rechazar perfiles pendientes.",
      });
      expect(updateStatusWithAuditMock).not.toHaveBeenCalled();
      expect(sendEmailMock).not.toHaveBeenCalled();
    },
  );
});
