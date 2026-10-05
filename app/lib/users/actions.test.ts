import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ownerOrAdminMock = vi.hoisted(() => vi.fn());
const ownerOrStaffMock = vi.hoisted(() => vi.fn());
const currentProfileMock = vi.hoisted(() => vi.fn());
const updateMock = vi.hoisted(() => vi.fn());
const deleteMock = vi.hoisted(() => vi.fn());
const transactionMock = vi.hoisted(() => vi.fn());
const selectMock = vi.hoisted(() => vi.fn());
const findFirstUserMock = vi.hoisted(() => vi.fn());
const findFirstSocialMock = vi.hoisted(() => vi.fn());
const deleteFilesMock = vi.hoisted(() => vi.fn());
const clerkUserMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/lib/users/helpers", () => ({
  buildWhereClauseForProfileFetching: vi.fn(),
  getCurrentUserProfile: currentProfileMock,
  requireAdminOrFestivalAdmin: vi.fn(),
  requireProfileOwnerOrAdmin: ownerOrAdminMock,
  requireProfileOwnerOrStaff: ownerOrStaffMock,
}));

vi.mock("@/app/lib/users/queries", () => ({
  fetchAdminUsers: vi.fn().mockResolvedValue([]),
  fetchUserProfileById: vi.fn().mockResolvedValue(null),
  getCurrentClerkUser: clerkUserMock,
}));

vi.mock("@/db", () => ({
  db: {
    update: updateMock,
    delete: deleteMock,
    select: selectMock,
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

import { signProfilePictureUpload } from "@/app/lib/uploadthing/profile-picture-receipt";
import {
  createUserProfile,
  deleteUserSocial,
  updateProfile,
  updateProfileCategories,
  updateProfilePicture,
  upsertUserSocialProfiles,
} from "@/app/lib/users/actions";

const OWNER = { id: 7, role: "user" };
const ADMIN = { id: 1, role: "admin" };
const SELECTABLE_ENTREPRENEURSHIP = {
  category: "entrepreneurship",
  visibility: "selectable",
  isAdminAssignableOnly: false,
};

/** Answers the subcategory lookup `db.select().from().where()` with `rows`. */
function subcategoryRows(
  rows: {
    category: string;
    visibility: string;
    isAdminAssignableOnly: boolean;
  }[],
) {
  const where = vi.fn().mockResolvedValue(rows);
  selectMock.mockReturnValue({ from: vi.fn(() => ({ where })) });
}

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
  selectMock.mockReset();
  findFirstUserMock.mockReset();
  findFirstSocialMock.mockReset();
  deleteFilesMock.mockReset();
  clerkUserMock.mockReset();
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

describe("updateProfileCategories", () => {
  it("refuses a caller the staff gate turned down", async () => {
    ownerOrStaffMock.mockResolvedValue(null);

    await expect(
      updateProfileCategories(7, "illustrator", [1]),
    ).resolves.toEqual({ success: false, message: "No autorizado" });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("runs for the profile owner while they complete their profile", async () => {
    ownerOrStaffMock.mockResolvedValue({
      ...OWNER,
      category: "none",
      profileSubcategories: [],
    });
    subcategoryRows([SELECTABLE_ENTREPRENEURSHIP, SELECTABLE_ENTREPRENEURSHIP]);
    transactionMock.mockResolvedValue(undefined);

    await expect(
      updateProfileCategories(OWNER.id, "entrepreneurship", [1, 2]),
    ).resolves.toMatchObject({ success: true });
    expect(transactionMock).toHaveBeenCalled();
  });

  describe("an onboarding owner's pick", () => {
    beforeEach(() => {
      ownerOrStaffMock.mockResolvedValue({
        ...OWNER,
        category: "none",
        profileSubcategories: [],
      });
      transactionMock.mockResolvedValue(undefined);
    });

    it.each([
      [
        "no subcategories, which would keep them in onboarding",
        "illustration",
        [],
      ],
      ["the deprecated new_artist area", "new_artist", [1]],
      ["no area", "none", [1]],
      ["an id that is not a whole number", "illustration", [1.5]],
    ])(
      "refuses %s without looking up a subcategory",
      async (_, category, ids) => {
        await expect(
          updateProfileCategories(OWNER.id, category as never, ids as number[]),
        ).resolves.toEqual({ success: false, message: "No autorizado" });
        expect(selectMock).not.toHaveBeenCalled();
        expect(transactionMock).not.toHaveBeenCalled();
      },
    );

    it.each([
      [
        "an admin-assignable-only subcategory",
        [{ ...SELECTABLE_ENTREPRENEURSHIP, isAdminAssignableOnly: true }],
        [1],
      ],
      [
        "a listed subcategory that is not selectable",
        [{ ...SELECTABLE_ENTREPRENEURSHIP, visibility: "listed" }],
        [1],
      ],
      [
        "a hidden subcategory",
        [{ ...SELECTABLE_ENTREPRENEURSHIP, visibility: "hidden" }],
        [1],
      ],
      [
        "a subcategory from another area",
        [{ ...SELECTABLE_ENTREPRENEURSHIP, category: "gastronomy" }],
        [1],
      ],
      ["an id that does not exist", [SELECTABLE_ENTREPRENEURSHIP], [1, 404]],
      ["the same id twice", [SELECTABLE_ENTREPRENEURSHIP], [1, 1]],
    ])("refuses %s", async (_, rows, ids) => {
      subcategoryRows(rows);

      await expect(
        updateProfileCategories(OWNER.id, "entrepreneurship", ids),
      ).resolves.toEqual({ success: false, message: "No autorizado" });
      expect(selectMock).toHaveBeenCalled();
      expect(transactionMock).not.toHaveBeenCalled();
    });
  });

  it("refuses the owner once their category and subcategories are set", async () => {
    ownerOrStaffMock.mockResolvedValue({
      ...OWNER,
      category: "illustration",
      profileSubcategories: [{ subcategoryId: 1 }],
    });

    await expect(
      updateProfileCategories(OWNER.id, "entrepreneurship", [2]),
    ).resolves.toEqual({ success: false, message: "No autorizado" });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it.each([
    ["an admin", ADMIN],
    ["a festival admin", { id: 2, role: "festival_admin" }],
  ])("lets %s recategorize a completed profile", async (_, staff) => {
    // Staff with a finished profile of their own, so only the role lets
    // them through.
    ownerOrStaffMock.mockResolvedValue({
      ...staff,
      category: "illustration",
      profileSubcategories: [{ subcategoryId: 1 }],
    });
    transactionMock.mockResolvedValue(undefined);

    await expect(
      updateProfileCategories(OWNER.id, "entrepreneurship", [2]),
    ).resolves.toMatchObject({ success: true });
    expect(transactionMock).toHaveBeenCalled();
  });

  it("lets staff assign subcategories a participant cannot pick", async () => {
    ownerOrStaffMock.mockResolvedValue({
      ...ADMIN,
      category: "none",
      profileSubcategories: [],
    });
    transactionMock.mockResolvedValue(undefined);

    await expect(
      updateProfileCategories(OWNER.id, "entrepreneurship", [9]),
    ).resolves.toMatchObject({ success: true });
    expect(selectMock).not.toHaveBeenCalled();
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

describe("createUserProfile", () => {
  const CLERK_USER = {
    id: "clerk_new",
    emailAddresses: [{ emailAddress: "ana@example.com" }],
    firstName: "Ana",
    lastName: "Pérez",
    imageUrl: "https://img.clerk.com/ana",
  };

  /** Runs the transaction against a fake `tx` and captures the user insert. */
  function captureInsert() {
    const inserted: Record<string, unknown>[] = [];
    transactionMock.mockImplementation(async (callback) =>
      callback({
        insert: () => ({
          values: (values: Record<string, unknown>) => {
            inserted.push(values);
            return {
              onConflictDoNothing: () => ({
                returning: async () => [{ id: 11, ...values }],
              }),
            };
          },
        }),
      }),
    );
    return inserted;
  }

  it("refuses a caller with no Clerk session before any write", async () => {
    clerkUserMock.mockResolvedValue(null);

    await expect(createUserProfile()).resolves.toEqual({
      success: false,
      message: "No autorizado",
    });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("builds the row from the session and ignores anything the caller sends", async () => {
    clerkUserMock.mockResolvedValue(CLERK_USER);
    const inserted = captureInsert();

    // A forged POST can still put arguments on the wire; none of them may
    // reach the row.
    const forged = createUserProfile as (
      ...args: unknown[]
    ) => Promise<unknown>;
    await expect(
      forged({
        clerkId: "clerk_victim",
        email: "victim@example.com",
        role: "admin",
        status: "verified",
      }),
    ).resolves.toMatchObject({ success: true });

    expect(inserted[0]).toEqual({
      clerkId: "clerk_new",
      email: "ana@example.com",
      firstName: "Ana",
      lastName: "Pérez",
      imageUrl: "https://img.clerk.com/ana",
    });
  });
});
