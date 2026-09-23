import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const currentClerkUserMock = vi.hoisted(() => vi.fn());
const fetchProfileByClerkIdMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/lib/users/actions", () => ({
  getCurrentClerkUser: currentClerkUserMock,
  cachedFetchUserProfileByClerkId: fetchProfileByClerkIdMock,
  cachedFetchBaseUserProfileByClerkId: vi.fn(),
}));

vi.mock("@/app/lib/users/navbar-profile", () => ({
  cachedFetchNavbarProfileByClerkId: vi.fn(),
}));

vi.mock("@/db", () => ({ db: {} }));

import {
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
