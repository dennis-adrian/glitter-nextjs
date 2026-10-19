// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { headersMock, currentProfileMock, fetchRuleMock } = vi.hoisted(() => ({
  headersMock: vi.fn(),
  currentProfileMock: vi.fn(),
  fetchRuleMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: headersMock }));
vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: currentProfileMock,
}));
vi.mock("@/app/lib/feature_flags/data", () => ({
  fetchFeatureFlagRule: fetchRuleMock,
}));

import { isLayoutFeatureEnabled } from "@/app/lib/feature_flags/helpers";

const ADMIN = { id: 7, role: "admin" };

describe("isLayoutFeatureEnabled", () => {
  beforeEach(() => {
    headersMock.mockReset();
    currentProfileMock.mockReset();
    fetchRuleMock.mockReset();
    fetchRuleMock.mockResolvedValue({
      visibility: "admin_only",
      targetedUserIds: [],
    });
  });

  it("evaluates a force-static render for a signed-out visitor without asking Clerk", async () => {
    // What Next hands a `force-static` render in place of the request's.
    headersMock.mockResolvedValue(new Headers());

    await expect(isLayoutFeatureEnabled("blog")).resolves.toBe(false);
    expect(currentProfileMock).not.toHaveBeenCalled();
  });

  it("evaluates a request for the signed-in viewer", async () => {
    headersMock.mockResolvedValue(new Headers({ host: "localhost:3000" }));
    currentProfileMock.mockResolvedValue(ADMIN);

    await expect(isLayoutFeatureEnabled("blog")).resolves.toBe(true);
  });

  it("evaluates a signed-out request for a signed-out visitor", async () => {
    headersMock.mockResolvedValue(new Headers({ host: "localhost:3000" }));
    currentProfileMock.mockResolvedValue(null);

    await expect(isLayoutFeatureEnabled("blog")).resolves.toBe(false);
  });
});
