import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const currentClerkUserMock = vi.hoisted(() => vi.fn());
const fetchProfileByClerkIdMock = vi.hoisted(() => vi.fn());
const viewerClerkIdMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/lib/users/queries", () => ({
  getCurrentClerkUser: currentClerkUserMock,
  cachedFetchUserProfileByClerkId: fetchProfileByClerkIdMock,
  cachedFetchBaseUserProfileByClerkId: vi.fn(),
}));

// Whoever Clerk says is signed in is the viewer: nobody is viewing as
// someone else in these tests.
vi.mock("@/app/lib/impersonation/viewer", () => ({
  getViewerClerkId: viewerClerkIdMock,
}));

vi.mock("@/app/lib/users/navbar-profile", () => ({
  cachedFetchNavbarProfileByClerkId: vi.fn(),
}));

vi.mock("@/db", () => ({ db: {} }));

import { notFound, redirect } from "next/navigation";

import {
  getCurrentUserProfile,
  requireAdmin,
  requireProfileOwnerOrAdmin,
  requireProfileOwnerOrStaff,
} from "@/app/lib/users/helpers";

const OWNER = { id: 7, role: "user" };
const OTHER_USER = { id: 8, role: "artist" };
const FESTIVAL_ADMIN = { id: 9, role: "festival_admin" };
const ADMIN = { id: 1, role: "admin" };

function signedInAs(profile: unknown) {
  currentClerkUserMock.mockResolvedValue({ id: "clerk_1" });
  fetchProfileByClerkIdMock.mockResolvedValue(profile);
}

describe("profile write gates", () => {
  beforeEach(() => {
    currentClerkUserMock.mockReset();
    fetchProfileByClerkIdMock.mockReset();
    // Whoever Clerk says is signed in is the viewer, unless a test says not.
    viewerClerkIdMock.mockReset();
    viewerClerkIdMock.mockImplementation(
      async () =>
        ((await currentClerkUserMock()) as { id: string } | null)?.id ?? null,
    );
  });

  it("finds the profile of the viewer, not of the signed-in account", async () => {
    // An admin is signed in and views the app as a participant.
    currentClerkUserMock.mockResolvedValue({ id: "clerk_admin" });
    viewerClerkIdMock.mockResolvedValue("clerk_participant");
    fetchProfileByClerkIdMock.mockResolvedValue(OWNER);

    await expect(getCurrentUserProfile()).resolves.toBe(OWNER);
    expect(fetchProfileByClerkIdMock).toHaveBeenCalledWith("clerk_participant");
    expect(fetchProfileByClerkIdMock).not.toHaveBeenCalledWith("clerk_admin");
    // So nothing admin-only opens from inside the view.
    await expect(requireAdmin()).resolves.toBeNull();
  });

  it("refuses an unauthenticated caller", async () => {
    currentClerkUserMock.mockResolvedValue(null);

    await expect(requireProfileOwnerOrAdmin(7)).resolves.toBeNull();
    await expect(requireProfileOwnerOrStaff(7)).resolves.toBeNull();
    await expect(requireAdmin()).resolves.toBeNull();
  });

  it("refuses a signed-in user whose profile row is gone", async () => {
    signedInAs(null);

    await expect(requireProfileOwnerOrAdmin(7)).resolves.toBeNull();
    await expect(requireProfileOwnerOrStaff(7)).resolves.toBeNull();
  });

  it("lets a profile owner act on its own row", async () => {
    signedInAs(OWNER);

    await expect(requireProfileOwnerOrAdmin(OWNER.id)).resolves.toBe(OWNER);
    await expect(requireProfileOwnerOrStaff(OWNER.id)).resolves.toBe(OWNER);
  });

  it("refuses a user aiming at somebody else's row", async () => {
    signedInAs(OTHER_USER);

    await expect(requireProfileOwnerOrAdmin(OWNER.id)).resolves.toBeNull();
    await expect(requireProfileOwnerOrStaff(OWNER.id)).resolves.toBeNull();
  });

  it("lets an admin act on anyone", async () => {
    signedInAs(ADMIN);

    await expect(requireProfileOwnerOrAdmin(OWNER.id)).resolves.toBe(ADMIN);
    await expect(requireProfileOwnerOrStaff(OWNER.id)).resolves.toBe(ADMIN);
    await expect(requireAdmin()).resolves.toBe(ADMIN);
  });

  it("admits a festival admin only to the staff gate", async () => {
    signedInAs(FESTIVAL_ADMIN);

    await expect(requireProfileOwnerOrStaff(OWNER.id)).resolves.toBe(
      FESTIVAL_ADMIN,
    );
    await expect(requireProfileOwnerOrAdmin(OWNER.id)).resolves.toBeNull();
    await expect(requireAdmin()).resolves.toBeNull();
  });
});

describe("getCurrentUserProfile", () => {
  beforeEach(() => {
    currentClerkUserMock.mockReset();
    fetchProfileByClerkIdMock.mockReset();
    // The viewer is the one lookup getCurrentUserProfile makes.
    viewerClerkIdMock.mockReset();
  });

  it("reads a failed lookup as signed out", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    viewerClerkIdMock.mockRejectedValue(new Error("network down"));

    await expect(getCurrentUserProfile()).resolves.toBeNull();
  });

  // A redirect or a 404 thrown underneath must reach Next, not turn into a
  // signed-out visitor who then sees "no access" until a reload.
  it("lets Next's own control-flow errors through", async () => {
    viewerClerkIdMock.mockImplementation(async () => redirect("/sign_in"));
    await expect(getCurrentUserProfile()).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    });

    viewerClerkIdMock.mockImplementation(async () => notFound());
    await expect(getCurrentUserProfile()).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_HTTP_ERROR_FALLBACK"),
    });
  });
});
