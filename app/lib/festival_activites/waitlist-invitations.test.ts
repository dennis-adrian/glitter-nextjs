// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Sends waitlist invitations through the real `sendEmail` and Resend SDK with
 * the HTTP reply mocked. Resend resolves a rejected send instead of throwing,
 * so only an actual error reply shows whether an invitation nobody received
 * is still recorded as sent.
 */

const {
  dbMock,
  currentProfile,
  wasRemovedFromActivity,
  isActiveInActivity,
  lockVariant,
  countVariantSeats,
  eligibleWaitlistEntries,
} = vi.hoisted(() => ({
  dbMock: { transaction: vi.fn(), select: vi.fn(), update: vi.fn() },
  currentProfile: vi.fn(),
  wasRemovedFromActivity: vi.fn(),
  isActiveInActivity: vi.fn(),
  lockVariant: vi.fn(),
  countVariantSeats: vi.fn(),
  eligibleWaitlistEntries: vi.fn(),
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
vi.mock("@/app/lib/festival_activites/queries", () => ({
  wasRemovedFromActivity,
  isActiveInActivity,
  lockVariant,
  countVariantSeats,
  eligibleWaitlistEntries,
}));
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
  isActiveInActivity.mockResolvedValue(false);
  // The locked variant as the server would read it: unlimited, any category.
  lockVariant.mockImplementation(async (_tx, id: number) => ({
    id,
    activityId: 8,
    participationLimit: null,
    category: null,
  }));
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

  // The read that picks the variant, then the claim that sends the email.
  let transactions: Promise<unknown>[];

  beforeEach(() => {
    transactions = [];
    currentProfile.mockResolvedValue({ id: 1, role: "admin" });
    wasRemovedFromActivity.mockResolvedValue(false);
    dbMock.transaction.mockImplementation((run) => {
      const transaction = run({
        query: {
          festivalActivityWaitlist: { findFirst: async () => entry },
        },
        update: dbMock.update,
      });
      transactions.push(transaction);
      return transaction;
    });
    dbMock.update.mockReturnValue({
      set: () => ({
        where: () => ({ returning: async () => [{ id: entry.id }] }),
      }),
    });
  });

  it("rolls back the claim of an invitation Resend rejected", async () => {
    fetchMock.mockImplementation(rejected);

    await expect(notifyWaitlistEntry(entry.id, 2)).resolves.toEqual({
      success: false,
      message: "Error al enviar la notificación",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    // The claim was made, then its transaction failed, which rolls it back.
    expect(dbMock.update).toHaveBeenCalledOnce();
    await expect(transactions[1]).rejects.toBeInstanceOf(EmailSendError);
  });

  it("records the invitation once Resend accepts it", async () => {
    fetchMock.mockImplementation(accepted);

    await expect(notifyWaitlistEntry(entry.id, 2)).resolves.toEqual({
      success: true,
      message: "Notificación enviada correctamente",
    });
    expect(dbMock.update).toHaveBeenCalledOnce();
    await expect(transactions[1]).resolves.toBe("sent");
  });

  it("sends nothing when the variant is full under its lock", async () => {
    // Staff set a limit after the variant was picked, and it is reached.
    lockVariant.mockResolvedValue({ id: 5, participationLimit: 1 });
    countVariantSeats.mockResolvedValue({ activeCount: 1, reservedCount: 0 });

    await expect(notifyWaitlistEntry(entry.id, 2)).resolves.toEqual({
      success: false,
      message: "No hay cupos disponibles para la categoría de este usuario",
    });
    expect(lockVariant).toHaveBeenCalledWith(expect.anything(), 5);
    expect(dbMock.update).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes the claim on to the next matching variant once one is full under its lock", async () => {
    fetchMock.mockImplementation(accepted);
    const set = vi.fn(() => ({
      where: () => ({ returning: async () => [{ id: entry.id }] }),
    }));
    dbMock.update.mockReturnValue({ set });
    const twoVariants = {
      ...entry,
      activity: {
        ...entry.activity,
        details: [
          { id: 5, category: null, participationLimit: null },
          { id: 6, category: null, participationLimit: null },
        ],
      },
    };
    dbMock.transaction.mockImplementation((run) => {
      const transaction = run({
        query: {
          festivalActivityWaitlist: { findFirst: async () => twoVariants },
        },
        update: dbMock.update,
      });
      transactions.push(transaction);
      return transaction;
    });
    // Staff set a limit on 5 after it was picked, and it is reached.
    lockVariant.mockImplementation(async (_tx, id: number) =>
      id === 5 ? { id, participationLimit: 1 } : { id },
    );
    countVariantSeats.mockResolvedValue({ activeCount: 1, reservedCount: 0 });

    await expect(notifyWaitlistEntry(entry.id, 2)).resolves.toEqual({
      success: true,
      message: "Notificación enviada correctamente",
    });
    expect(lockVariant.mock.calls.map(([, id]) => id)).toEqual([5, 6]);
    expect(set).toHaveBeenCalledOnce();
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ notifiedForDetailId: 6 }),
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("sends nothing when another invitation claimed the entry first", async () => {
    dbMock.update.mockReturnValue({
      set: () => ({ where: () => ({ returning: async () => [] }) }),
    });

    await expect(notifyWaitlistEntry(entry.id, 2)).resolves.toEqual({
      success: false,
      message: "No se pudo guardar la notificación; intentá nuevamente",
    });
    expect(fetchMock).not.toHaveBeenCalled();
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
              // The capacity lock: an unlimited variant always has room.
              for: async () => [{ limit: null }],
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

    await expect(promoteFromWaitlist(8, 5)).resolves.toEqual({ failed: true });

    // A rejected transaction callback is what rolls the claim back.
    await expect(transaction).rejects.toBeInstanceOf(EmailSendError);
    expect(console.error).toHaveBeenCalledWith(
      "Error promoting from waitlist",
      expect.any(EmailSendError),
    );
  });

  it("commits the claim once Resend accepts the invitation", async () => {
    fetchMock.mockImplementation(accepted);

    await expect(promoteFromWaitlist(8, 5)).resolves.toEqual({
      userId: 4,
      displayName: invitee.displayName,
    });

    await expect(transaction).resolves.toEqual({
      userId: 4,
      displayName: invitee.displayName,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
