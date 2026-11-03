import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const authMock = vi.hoisted(() => vi.fn());
const currentUserMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
  currentUser: currentUserMock,
}));

vi.mock("@/db", () => ({ db: {} }));

import {
  getCurrentClerkUser,
  getCurrentClerkUserDetails,
} from "@/app/lib/users/queries";

describe("getCurrentClerkUser", () => {
  beforeEach(() => {
    authMock.mockReset();
    currentUserMock.mockReset();
  });

  it("reads the id from the session, without asking Clerk's API for the user", async () => {
    authMock.mockResolvedValue({ userId: "user_123" });

    await expect(getCurrentClerkUser()).resolves.toEqual({ id: "user_123" });
    expect(currentUserMock).not.toHaveBeenCalled();
  });

  it("is null when nobody is signed in", async () => {
    authMock.mockResolvedValue({ userId: null });

    await expect(getCurrentClerkUser()).resolves.toBeNull();
  });
});

describe("getCurrentClerkUserDetails", () => {
  it("fetches the whole user for the callers that read its fields", async () => {
    const user = { id: "user_123", emailAddresses: [] };
    currentUserMock.mockResolvedValue(user);

    await expect(getCurrentClerkUserDetails()).resolves.toBe(user);
  });
});
