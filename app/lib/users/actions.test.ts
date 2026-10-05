import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
const fetchUserProfileByIdMock = vi.hoisted(() => vi.fn());
const fetchAdminUsersMock = vi.hoisted(() => vi.fn());
const sendEmailMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/lib/users/helpers", () => ({
  buildWhereClauseForProfileFetching: vi.fn(),
  getCurrentUserProfile: currentProfileMock,
  requireProfileOwnerOrAdmin: ownerOrAdminMock,
  requireProfileOwnerOrStaff: ownerOrStaffMock,
}));

vi.mock("@/app/api/users/actions", () => ({
  fetchAdminUsers: fetchAdminUsersMock,
  fetchUserProfileById: fetchUserProfileByIdMock,
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

vi.mock("@/app/vendors/resend", () => ({ sendEmail: sendEmailMock }));
vi.mock("@/app/emails/profile-completion", () => ({ default: vi.fn() }));
vi.mock("@/app/emails/subcategory-update", () => ({ default: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ currentUser: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/lib/posthog-server", () => ({
  getPostHogClient: vi.fn(),
  POSTHOG_SHUTDOWN_TIMEOUT_MS: 1,
}));

import { signProfilePictureUpload } from "@/app/lib/uploadthing/profile-picture-receipt";
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
  fetchUserProfileByIdMock.mockReset();
  fetchUserProfileByIdMock.mockResolvedValue(null);
  fetchAdminUsersMock.mockReset();
  fetchAdminUsersMock.mockResolvedValue([]);
  sendEmailMock.mockReset();
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

  it("refuses a display name over 80 characters without touching the row", async () => {
    ownerOrAdminMock.mockResolvedValue(OWNER);

    await expect(
      updateProfile(OWNER.id, { displayName: "a".repeat(81) }),
    ).resolves.toEqual({
      success: false,
      message: "Tu nombre puede tener hasta 80 caracteres",
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("stores a display name trimmed, so trailing spaces cannot pass the limit", async () => {
    ownerOrAdminMock.mockResolvedValue(OWNER);
    const { set } = captureUpdate();
    const name = "a".repeat(80);

    await expect(
      updateProfile(OWNER.id, { displayName: `${name}   ` }),
    ).resolves.toMatchObject({ success: true });
    expect(set.mock.calls[0][0]).toHaveProperty("displayName", name);
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

describe("updateProfile admin notice", () => {
  const COMPLETE_PROFILE = {
    id: 7,
    status: "pending",
    displayName: "Ana Ilustra",
    email: "ana@example.com",
    bio: "Ilustradora",
    imageUrl: "https://utfs.io/f/ana",
    firstName: "Ana",
    lastName: "Paz",
    birthdate: new Date("1995-05-05"),
    phoneNumber: "70000000",
    gender: "female",
    country: "BO",
    category: "illustration",
    profileSubcategories: [{ subcategoryId: 1 }],
    userSocials: [{ type: "instagram", username: "ana" }],
  };
  const INCOMPLETE_PROFILE = { ...COMPLETE_PROFILE, phoneNumber: null };

  /** Serves the profile as read before the write, then as read after it. */
  function profileGoesFrom(before: object, after: object) {
    fetchUserProfileByIdMock
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce(after);
  }

  beforeEach(() => {
    ownerOrAdminMock.mockResolvedValue(OWNER);
    captureUpdate();
    fetchAdminUsersMock.mockResolvedValue([{ email: "admin@example.com" }]);
  });

  it("tells admins on the save that completes the profile", async () => {
    profileGoesFrom(INCOMPLETE_PROFILE, COMPLETE_PROFILE);

    await updateProfile(OWNER.id, { phoneNumber: "70000000" });

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock.mock.calls[0][0].to).toEqual(["admin@example.com"]);
  });

  it("stays quiet when an already-complete profile is saved again", async () => {
    profileGoesFrom(COMPLETE_PROFILE, COMPLETE_PROFILE);

    await expect(
      updateProfile(OWNER.id, { bio: "Ilustradora y muralista" }),
    ).resolves.toMatchObject({ success: true });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("stays quiet while the profile is still incomplete", async () => {
    profileGoesFrom(INCOMPLETE_PROFILE, INCOMPLETE_PROFILE);

    await updateProfile(OWNER.id, { bio: "Ilustradora" });

    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("never asks admins to review a verified profile", async () => {
    profileGoesFrom(
      { ...INCOMPLETE_PROFILE, status: "verified" },
      { ...COMPLETE_PROFILE, status: "verified" },
    );

    await updateProfile(OWNER.id, { phoneNumber: "70000000" });

    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("tells admins when a rejected profile is completed again", async () => {
    profileGoesFrom(
      { ...INCOMPLETE_PROFILE, status: "rejected" },
      { ...COMPLETE_PROFILE, status: "rejected" },
    );

    await updateProfile(OWNER.id, { phoneNumber: "70000000" });

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it("judges completeness from the row as it was before this save", async () => {
    profileGoesFrom(INCOMPLETE_PROFILE, COMPLETE_PROFILE);

    await updateProfile(OWNER.id, { phoneNumber: "70000000" });

    expect(fetchUserProfileByIdMock.mock.invocationCallOrder[0]).toBeLessThan(
      updateMock.mock.invocationCallOrder[0],
    );
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
  const STORED_URL = "https://utfs.io/f/stored-key";
  const NEW_URL = "https://utfs.io/f/new-key";

  beforeEach(() => {
    vi.stubEnv("UPLOADTHING_TOKEN", "test-uploadthing-token");
    findFirstUserMock.mockResolvedValue({ imageUrl: STORED_URL });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("refuses an unauthorized caller", async () => {
    ownerOrAdminMock.mockResolvedValue(null);

    await expect(
      updateProfilePicture(99, NEW_URL, signProfilePictureUpload(99, NEW_URL)),
    ).resolves.toEqual({ success: false, message: "No autorizado" });
    expect(updateMock).not.toHaveBeenCalled();
    expect(deleteFilesMock).not.toHaveBeenCalled();
  });

  it("refuses a URL the caller did not upload, such as someone else's avatar", async () => {
    ownerOrAdminMock.mockResolvedValue(OWNER);
    captureUpdate();

    await expect(
      updateProfilePicture(OWNER.id, "https://utfs.io/f/someone-elses-key"),
    ).resolves.toMatchObject({ success: false });
    expect(updateMock).not.toHaveBeenCalled();
    expect(deleteFilesMock).not.toHaveBeenCalled();
  });

  it("refuses a receipt that was minted for a different uploader", async () => {
    ownerOrAdminMock.mockResolvedValue(OWNER);
    captureUpdate();

    await expect(
      updateProfilePicture(
        OWNER.id,
        NEW_URL,
        signProfilePictureUpload(99, NEW_URL),
      ),
    ).resolves.toMatchObject({ success: false });
    expect(updateMock).not.toHaveBeenCalled();
    expect(deleteFilesMock).not.toHaveBeenCalled();
  });

  it("saves the caller's own upload and deletes the previous one read from the row", async () => {
    ownerOrAdminMock.mockResolvedValue(OWNER);
    const { set } = captureUpdate();

    await expect(
      updateProfilePicture(
        OWNER.id,
        NEW_URL,
        signProfilePictureUpload(OWNER.id, NEW_URL),
      ),
    ).resolves.toMatchObject({ success: true });
    expect(set.mock.calls[0][0]).toHaveProperty("imageUrl", NEW_URL);
    expect(deleteFilesMock).toHaveBeenCalledWith("stored-key");
  });

  it("lets an admin set a picture the admin uploaded onto another profile", async () => {
    ownerOrAdminMock.mockResolvedValue(ADMIN);
    const { set } = captureUpdate();

    await expect(
      updateProfilePicture(
        OWNER.id,
        NEW_URL,
        signProfilePictureUpload(ADMIN.id, NEW_URL),
      ),
    ).resolves.toMatchObject({ success: true });
    expect(set.mock.calls[0][0]).toHaveProperty("imageUrl", NEW_URL);
  });

  it("keeps the upload when the same picture is saved again, receipt or not", async () => {
    ownerOrAdminMock.mockResolvedValue(OWNER);
    captureUpdate();

    await expect(
      updateProfilePicture(OWNER.id, STORED_URL),
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
