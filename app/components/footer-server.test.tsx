// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The footer renders inside every route, the `force-static` program pages
 * included, so its flag check may not ask Clerk for the viewer there. Runs the
 * real flag helpers; only the request, the session and the flag read are faked.
 */

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
vi.mock("@/app/components/footer", () => ({ default: () => null }));

import FooterServer from "@/app/components/footer-server";

describe("FooterServer", () => {
  beforeEach(() => {
    headersMock.mockReset();
    currentProfileMock.mockReset();
    fetchRuleMock.mockReset();
    fetchRuleMock.mockResolvedValue({
      visibility: "admin_only",
      targetedUserIds: [],
    });
  });

  it("evaluates the blog flag for a signed-out visitor in a force-static render", async () => {
    headersMock.mockResolvedValue(new Headers());

    expect((await FooterServer()).props).toEqual({ blogEnabled: false });
    expect(currentProfileMock).not.toHaveBeenCalled();
  });

  it("evaluates the blog flag for the signed-in viewer on a request", async () => {
    headersMock.mockResolvedValue(new Headers({ host: "localhost:3000" }));
    currentProfileMock.mockResolvedValue({ id: 7, role: "admin" });

    expect((await FooterServer()).props).toEqual({ blogEnabled: true });
  });
});
