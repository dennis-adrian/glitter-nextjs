// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Sends waitlist invitations through the real `sendEmail` and Resend SDK with
 * the HTTP reply mocked. Resend resolves a rejected send instead of throwing,
 * so only an actual error reply shows whether an invitation nobody received
 * is still recorded as sent.
 */

const { dbMock, currentProfile } = vi.hoisted(() => ({
  dbMock: { transaction: vi.fn(), select: vi.fn(), update: vi.fn() },
  currentProfile: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/env", () => ({
  serverEnv: { RESEND_API_KEY: "re_test", VERCEL_ENV: "production" },
}));
vi.mock("@/db", () => ({ db: dbMock }));
vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: currentProfile,
}));
vi.mock("@/app/lib/users/queries", () => ({ fetchAdminUsers: vi.fn() }));
vi.mock("@/app/lib/festivals/actions", () => ({ fetchBaseFestival: vi.fn() }));
vi.mock("@/app/lib/uploadthing/storage", () => ({
  attemptStorageCleanupJob: vi.fn(),
  enqueueStorageCleanupJob: vi.fn(),
}));

import { notifyWaitlistEntry } from "@/app/lib/festival_activites/admin-actions";
import { promoteFromWaitlist } from "@/app/lib/festival_activites/waitlist-promotion";
import { EmailSendError } from "@/app/vendors/resend-result";

const invitee = {
  email: "ana@example.com",
  displayName: "Ana",
  firstName: "Ana",
  lastName: "Rojas",
  category: "illustration",
};

const fetchMock = vi.fn();

function resendReply(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const rejected = () =>
  resendReply(
    { name: "validation_error", statusCode: 422, message: "Invalid `to`." },
    422,
  );
const accepted = async () => resendReply({ id: "email-1" }, 200);

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  // The SDK logs every API error outside production, and so do the actions.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("notifyWaitlistEntry", () => {
  const entry = {
    id: 3,
    userId: 4,
    notifiedAt: null,
    expiresAt: null,
    user: invitee,
    activity: {
      id: 8,
      name: "Sorteo",
      waitlistWindowMinutes: 60,
      festival: { name: "Glitter", festivalType: "glitter" },
      // No limit, so the variant matches without counting seats.
      details: [{ id: 5, category: null, participationLimit: null }],
    },
  };

  beforeEach(() => {
    currentProfile.mockResolvedValue({ id: 1, role: "admin" });
    dbMock.transaction.mockImplementation(async (run) =>
      run({
        query: {
          festivalActivityWaitlist: { findFirst: async () => entry },
        },
      }),
    );
    dbMock.update.mockReturnValue({
      set: () => ({
        where: () => ({ returning: async () => [{ id: entry.id }] }),
      }),
    });
  });

  it("does not record an invitation Resend rejected", async () => {
    fetchMock.mockImplementation(rejected);

    await expect(notifyWaitlistEntry(entry.id, 2)).resolves.toEqual({
      success: false,
      message: "Error al enviar la notificación",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it("records the invitation once Resend accepts it", async () => {
    fetchMock.mockImplementation(accepted);

    await expect(notifyWaitlistEntry(entry.id, 2)).resolves.toEqual({
      success: true,
      message: "Notificación enviada correctamente",
    });
    expect(dbMock.update).toHaveBeenCalledOnce();
  });
});

describe("promoteFromWaitlist", () => {
  let transaction: Promise<unknown> | undefined;

  beforeEach(() => {
    transaction = undefined;
    dbMock.select.mockReturnValue({
      from: () => ({
        innerJoin: () => ({
          innerJoin: () => ({
            where: async () => [
              {
                category: null,
                activityName: "Sorteo",
                waitlistWindowMinutes: 60,
                festivalId: 2,
                festivalName: "Glitter",
                festivalType: "glitter",
              },
            ],
          }),
        }),
      }),
    });
    dbMock.transaction.mockImplementation((run) => {
      transaction = run({
        // The claim: the next entry is stamped notified.
        execute: async () => ({ rows: [{ id: 9, userId: 4 }] }),
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [
                {
                  userEmail: invitee.email,
                  userDisplayName: invitee.displayName,
                  userFirstName: invitee.firstName,
                  userLastName: invitee.lastName,
                },
              ],
            }),
          }),
        }),
      });
      return transaction;
    });
  });

  it("fails the claim's transaction when Resend rejects the invitation", async () => {
    fetchMock.mockImplementation(rejected);

    await promoteFromWaitlist(8, 5);

    // A rejected transaction callback is what rolls the claim back.
    await expect(transaction).rejects.toBeInstanceOf(EmailSendError);
    expect(console.error).toHaveBeenCalledWith(
      "Error promoting from waitlist",
      expect.any(EmailSendError),
    );
  });

  it("commits the claim once Resend accepts the invitation", async () => {
    fetchMock.mockImplementation(accepted);

    await promoteFromWaitlist(8, 5);

    await expect(transaction).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
