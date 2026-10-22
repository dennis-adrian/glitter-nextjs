// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The navbar renders inside every route, the `force-static` program pages
 * included, so none of its flag checks may ask Clerk for the viewer there.
 * Runs the real flag helpers; only the request, the session and the data
 * reads are faked.
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
vi.mock("@/app/lib/landing_content/data", () => ({
  getPublishedLandingContent: vi.fn(async () => ({ announcement: null })),
}));
vi.mock("@/app/lib/programs/data", () => ({
  fetchProgramsNavTarget: vi.fn(async () => "/programs/demo"),
}));
vi.mock("@/app/lib/notifications/push/config", () => ({
  pushPublicKey: () => "vapid-public-key",
}));
vi.mock("@/app/components/navbar/navbar-client", () => ({
  default: () => null,
}));
vi.mock("@/app/components/navbar/announcement-strip", () => ({
  default: () => null,
}));

import Navbar from "@/app/components/navbar/navbar";
import NavbarClient from "@/app/components/navbar/navbar-client";

async function navbarClientProps() {
  const element = await Navbar();
  const children: { type: unknown; props: Record<string, unknown> }[] =
    element.props.children;

  return children.find((child) => child.type === NavbarClient)?.props;
}

describe("Navbar", () => {
  beforeEach(() => {
    headersMock.mockReset();
    currentProfileMock.mockReset();
    fetchRuleMock.mockReset();
    fetchRuleMock.mockResolvedValue({
      visibility: "admin_only",
      targetedUserIds: [],
    });
  });

  it("evaluates every flag for a signed-out visitor in a force-static render", async () => {
    headersMock.mockResolvedValue(new Headers());

    expect(await navbarClientProps()).toMatchObject({
      programsHref: null,
      creditsEnabled: false,
      blogEnabled: false,
      notificationsEnabled: false,
      pushPublicKey: null,
    });
    expect(currentProfileMock).not.toHaveBeenCalled();
  });

  it("evaluates every flag for the signed-in viewer on a request", async () => {
    headersMock.mockResolvedValue(new Headers({ host: "localhost:3000" }));
    currentProfileMock.mockResolvedValue({ id: 7, role: "admin" });

    expect(await navbarClientProps()).toMatchObject({
      programsHref: "/programs/demo",
      creditsEnabled: true,
      blogEnabled: true,
      notificationsEnabled: true,
      pushPublicKey: "vapid-public-key",
    });
  });

  it("offers avisos only with both the inbox and the push flag", async () => {
    headersMock.mockResolvedValue(new Headers({ host: "localhost:3000" }));
    currentProfileMock.mockResolvedValue({ id: 7, role: "admin" });
    fetchRuleMock.mockImplementation(async (key: string) => ({
      visibility: key === "push_notifications" ? "hidden" : "admin_only",
      targetedUserIds: [],
    }));

    expect(await navbarClientProps()).toMatchObject({
      notificationsEnabled: true,
      pushPublicKey: null,
    });
  });
});
