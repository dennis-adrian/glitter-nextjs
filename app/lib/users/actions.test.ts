import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ownerOrAdminMock = vi.hoisted(() => vi.fn());
const ownerOrStaffMock = vi.hoisted(() => vi.fn());
const currentProfileMock = vi.hoisted(() => vi.fn());
const updateMock = vi.hoisted(() => vi.fn());
const deleteMock = vi.hoisted(() => vi.fn());
const transactionMock = vi.hoisted(() => vi.fn());
const findFirstUserMock = vi.hoisted(() => vi.fn());
const findFirstSocialMock = vi.hoisted(() => vi.fn());
const deleteFilesMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/lib/users/helpers", () => ({
  buildWhereClauseForProfileFetching: vi.fn(),
  getCurrentUserProfile: currentProfileMock,
  requireProfileOwnerOrAdmin: ownerOrAdminMock,
  requireProfileOwnerOrStaff: ownerOrStaffMock,
}));

vi.mock("@/app/api/users/actions", () => ({
  fetchAdminUsers: vi.fn().mockResolvedValue([]),
  fetchUserProfileById: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/db", () => ({
  db: {
    update: updateMock,
    delete: deleteMock,
    transaction: transactionMock,
    query: {
      users: { findFirst: findFirstUserMock },
      userSocials: { findFirst: findFirstSocialMock, findMany: vi.fn() },
    },
  },
}));

vi.mock("@/app/server/uploadthing", () => ({
  utapi: { deleteFiles: deleteFilesMock },
}));

vi.mock("@/app/vendors/resend", () => ({ sendEmail: vi.fn() }));
vi.mock("@/app/emails/profile-completion", () => ({ default: vi.fn() }));
vi.mock("@/app/emails/subcategory-update", () => ({ default: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ currentUser: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/lib/posthog-server", () => ({
  getPostHogClient: vi.fn(),
  POSTHOG_SHUTDOWN_TIMEOUT_MS: 1,
}));

import {
  deleteUserSocial,
  updateProfile,
  updateProfileCategories,
  updateProfilePicture,
  upsertUserSocialProfiles,
} from "@/app/lib/users/actions";

const OWNER = { id: 7, role: "user" };
const ADMIN = { id: 1, role: "admin" };

/** Captures the object handed to `.set()` by `db.update(...)`. */
function captureUpdate() {
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn(() => ({ where }));
  updateMock.mockReturnValue({ set });
  return { set, where };
}

beforeEach(() => {
  ownerOrAdminMock.mockReset();
  ownerOrStaffMock.mockReset();
  currentProfileMock.mockReset();
  updateMock.mockReset();
  deleteMock.mockReset();
  transactionMock.mockReset();
  findFirstUserMock.mockReset();
  findFirstSocialMock.mockReset();
  deleteFilesMock.mockReset();
});

describe("updateProfile", () => {
  it("refuses an unauthenticated caller without touching the row", async () => {
    ownerOrAdminMock.mockResolvedValue(null);

    await expect(updateProfile(7, { bio: "hola" })).resolves.toEqual({
      success: false,
      message: "No autorizado",
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("refuses when the caller does not own the targeted row", async () => {
    // The gate resolves the acting profile from the session; a mismatch is null.
    ownerOrAdminMock.mockResolvedValue(null);

    await expect(updateProfile(99, { displayName: "otro" })).resolves.toEqual({
      success: false,
      message: "No autorizado",
    });
    expect(ownerOrAdminMock).toHaveBeenCalledWith(99);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("drops status, role and the other privileged columns", async () => {
    ownerOrAdminMock.mockResolvedValue(OWNER);
    const { set } = captureUpdate();

    await expect(
      updateProfile(OWNER.id, {
        displayName: "anaq",
        status: "verified",
        role: "admin",
        verifiedAt: new Date(),
        category: "illustrator",
        email: "attacker@example.com",
        clerkId: "user_someone_else",
        participationType: "individual",
        shouldSubmitProducts: false,
      } as never),
    ).resolves.toMatchObject({ success: true });

    const written = set.mock.calls[0][0];
    expect(written).toHaveProperty("displayName", "anaq");
    expect(Object.keys(written).sort()).toEqual(["displayName", "updatedAt"]);
  });

  it("lets an admin edit another profile's self-editable fields", async () => {
    ownerOrAdminMock.mockResolvedValue(ADMIN);
    const { set } = captureUpdate();

    await expect(
      updateProfile(OWNER.id, { phoneNumber: "70000000" }),
    ).resolves.toMatchObject({ success: true });
    expect(set.mock.calls[0][0]).toHaveProperty("phoneNumber", "70000000");
  });
});

describe("updateProfileCategories", () => {
  it("refuses a caller the staff gate turned down", async () => {
    ownerOrStaffMock.mockResolvedValue(null);

    await expect(
      updateProfileCategories(7, "illustrator", [1]),
    ).resolves.toEqual({ success: false, message: "No autorizado" });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("runs for the profile owner", async () => {
    ownerOrStaffMock.mockResolvedValue(OWNER);
    transactionMock.mockResolvedValue(undefined);

    await expect(
      updateProfileCategories(OWNER.id, "illustrator", [1]),
    ).resolves.toMatchObject({ success: true });
    expect(transactionMock).toHaveBeenCalled();
  });
});

describe("upsertUserSocialProfiles", () => {
  it("refuses writing socials onto another profile", async () => {
    ownerOrAdminMock.mockResolvedValue(null);

    await expect(
      upsertUserSocialProfiles(99, [{ type: "instagram", username: "x" }]),
    ).resolves.toEqual({ success: false, message: "No autorizado" });
    expect(transactionMock).not.toHaveBeenCalled();
  });
});

describe("updateProfilePicture", () => {
  it("refuses an unauthorized caller", async () => {
    ownerOrAdminMock.mockResolvedValue(null);

    await expect(
      updateProfilePicture(99, "https://utfs.io/f/new"),
    ).resolves.toEqual({ success: false, message: "No autorizado" });
    expect(updateMock).not.toHaveBeenCalled();
    expect(deleteFilesMock).not.toHaveBeenCalled();
  });

  it("deletes the previous upload read from the row, not one the caller named", async () => {
    ownerOrAdminMock.mockResolvedValue(OWNER);
    findFirstUserMock.mockResolvedValue({
      imageUrl: "https://utfs.io/f/stored-key",
    });
    captureUpdate();

    await expect(
      updateProfilePicture(OWNER.id, "https://utfs.io/f/new-key"),
    ).resolves.toMatchObject({ success: true });
    expect(deleteFilesMock).toHaveBeenCalledWith("stored-key");
  });

  it("keeps the upload when the same picture is saved again", async () => {
    ownerOrAdminMock.mockResolvedValue(OWNER);
    findFirstUserMock.mockResolvedValue({
      imageUrl: "https://utfs.io/f/stored-key",
    });
    captureUpdate();

    await expect(
      updateProfilePicture(OWNER.id, "https://utfs.io/f/stored-key"),
    ).resolves.toMatchObject({ success: true });
    expect(deleteFilesMock).not.toHaveBeenCalled();
  });
});

describe("deleteUserSocial", () => {
  it("refuses an unauthenticated caller", async () => {
    currentProfileMock.mockResolvedValue(null);

    await expect(deleteUserSocial(5)).resolves.toEqual({
      success: false,
      message: "No autorizado",
    });
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("refuses deleting a social that belongs to someone else", async () => {
    currentProfileMock.mockResolvedValue(OWNER);
    findFirstSocialMock.mockResolvedValue({ userId: 99 });

    await expect(deleteUserSocial(5)).resolves.toEqual({
      success: false,
      message: "No autorizado",
    });
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("answers the same way for a social id that does not exist", async () => {
    currentProfileMock.mockResolvedValue(OWNER);
    findFirstSocialMock.mockResolvedValue(undefined);

    await expect(deleteUserSocial(5)).resolves.toEqual({
      success: false,
      message: "No autorizado",
    });
  });

  it("deletes the caller's own social", async () => {
    currentProfileMock.mockResolvedValue(OWNER);
    findFirstSocialMock.mockResolvedValue({ userId: OWNER.id });
    deleteMock.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });

    await expect(deleteUserSocial(5)).resolves.toMatchObject({ success: true });
    expect(deleteMock).toHaveBeenCalled();
  });

  it("lets an admin delete any social", async () => {
    currentProfileMock.mockResolvedValue(ADMIN);
    findFirstSocialMock.mockResolvedValue({ userId: OWNER.id });
    deleteMock.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });

    await expect(deleteUserSocial(5)).resolves.toMatchObject({ success: true });
    expect(deleteMock).toHaveBeenCalled();
  });
});
