// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The navbar renders inside every route, the `force-static` program pages
 * included, so none of its flag checks may ask Clerk for the viewer there.
 * Runs the real flag helpers; only the request, the session and the data
 * reads are faked.
 */

const { headersMock, currentProfileMock, fetchRuleMock, impersonationMock } =
  vi.hoisted(() => ({
    headersMock: vi.fn(),
    currentProfileMock: vi.fn(),
    fetchRuleMock: vi.fn(),
    impersonationMock: vi.fn(),
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
// Staff and verified viewers read the active festival and the store settings;
// those reads are data, faked like the rest.
vi.mock("@/app/lib/festivals/helpers", () => ({
  getActiveFestivalBase: vi.fn(async () => null),
}));
vi.mock("@/app/lib/store_settings/closure", () => ({
  resolveSectionClosure: vi.fn(async () => ({ closed: false })),
}));
vi.mock("@/app/components/navbar/navbar-client", () => ({
  default: () => null,
}));
vi.mock("@/app/components/navbar/announcement-strip", () => ({
  default: () => null,
}));
vi.mock("@/app/components/impersonation/impersonation-banner", () => ({
  default: () => null,
}));
vi.mock("@/app/lib/impersonation/viewer", () => ({
  getImpersonation: impersonationMock,
}));

import ImpersonationBanner from "@/app/components/impersonation/impersonation-banner";
import Navbar from "@/app/components/navbar/navbar";
import NavbarClient from "@/app/components/navbar/navbar-client";

async function bannerProps() {
  const element = await Navbar();
  const children: { type: unknown; props: Record<string, unknown> }[] =
    element.props.children;
  return children.find((child) => child.type === ImpersonationBanner)?.props;
}

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
    impersonationMock.mockReset();
    impersonationMock.mockResolvedValue(null);
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

  describe("the view banner", () => {
    it("comes first, above the strip and the header", async () => {
      headersMock.mockResolvedValue(new Headers({ host: "localhost:3000" }));
      const element = await Navbar();
      const children: { type: unknown }[] = element.props.children;
      expect(children[0]?.type).toBe(ImpersonationBanner);
    });

    it("is handed the view, with only the participant's name, email and photo", async () => {
      headersMock.mockResolvedValue(new Headers({ host: "localhost:3000" }));
      currentProfileMock.mockResolvedValue({ id: 2, role: "user" });
      impersonationMock.mockResolvedValue({
        sessionId: 41,
        secondsLeft: 900,
        returnTo: null,
        actor: { id: 1 },
        subject: {
          id: 2,
          clerkId: "user_subject",
          displayName: "Ana",
          firstName: "Ana",
          lastName: "Pérez",
          email: "ana@example.com",
          imageUrl: null,
          phoneNumber: "+591 700 00000",
        },
      });
      expect(await bannerProps()).toEqual({
        probe: false,
        initial: {
          secondsLeft: 900,
          subject: {
            id: 2,
            displayName: "Ana",
            firstName: "Ana",
            lastName: "Pérez",
            email: "ana@example.com",
            imageUrl: null,
          },
        },
      });
    });

    it("has nothing to say outside a view", async () => {
      headersMock.mockResolvedValue(new Headers({ host: "localhost:3000" }));
      expect(await bannerProps()).toEqual({ initial: null, probe: false });
    });

    it("asks from the browser on a page rendered without a request", async () => {
      headersMock.mockResolvedValue(new Headers());
      expect(await bannerProps()).toEqual({ initial: null, probe: true });
      expect(impersonationMock).not.toHaveBeenCalled();
    });

    it("stays out of the way when the view cannot be read", async () => {
      headersMock.mockResolvedValue(new Headers({ host: "localhost:3000" }));
      impersonationMock.mockRejectedValue(new Error("database down"));
      expect(await bannerProps()).toEqual({ initial: null, probe: false });
    });
  });
});
