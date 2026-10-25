import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import NavbarClient from "@/app/components/navbar/navbar-client";

const { userMock, pathnameMock } = vi.hoisted(() => ({
  userMock: vi.fn(),
  pathnameMock: vi.fn(),
}));

vi.mock("@clerk/nextjs", () => ({
  useUser: userMock,
  useClerk: () => ({ signOut: vi.fn() }),
}));
vi.mock("next/navigation", () => ({
  usePathname: pathnameMock,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/app/lib/notifications/push/actions", () => ({
  savePushDeviceAction: vi.fn(),
  removePushDeviceAction: vi.fn(),
  forgetPushDeviceAction: vi.fn(),
  releaseForeignPushDeviceAction: vi.fn(),
}));
// The profile fetch and the session controls have their own suites.
vi.mock("@/app/components/navbar/use-navbar-profile", () => ({
  useNavbarProfile: () => ({ profile: null, isLoading: false }),
}));
vi.mock("@/app/components/navbar/session-buttons", () => ({
  default: () => <span data-testid="session-buttons" />,
}));
vi.mock("@/app/components/navbar/navigation-menu", () => ({
  default: () => <span data-testid="public-navigation" />,
}));

const props = {
  programsHref: null,
  creditsEnabled: false,
  blogEnabled: false,
  notificationsEnabled: true,
};

beforeEach(() => {
  pathnameMock.mockReturnValue("/portal");
});

afterEach(cleanup);

function shell(container: HTMLElement) {
  return {
    sidebar: container.querySelector("[data-app-sidebar]"),
    tabBar: container.querySelector("[data-app-tabbar]"),
  };
}

describe("NavbarClient", () => {
  it("keeps the public top navigation for a signed-out visitor", () => {
    userMock.mockReturnValue({ isLoaded: true, isSignedIn: false });
    const { container } = render(<NavbarClient {...props} />);

    expect(screen.getByTestId("public-navigation")).toBeTruthy();
    expect(shell(container)).toEqual({ sidebar: null, tabBar: null });
  });

  it("draws the app shell from the server's answer before Clerk loads", () => {
    userMock.mockReturnValue({ isLoaded: false, isSignedIn: undefined });
    const { container } = render(
      <NavbarClient {...props} viewer={{ role: "user", status: "verified" }} />,
    );

    expect(shell(container).sidebar).not.toBeNull();
    expect(shell(container).tabBar).not.toBeNull();
    expect(screen.queryByTestId("public-navigation")).toBeNull();
  });

  it("draws it once Clerk reports a session the server could not see", () => {
    userMock.mockReturnValue({ isLoaded: true, isSignedIn: true });
    const { container } = render(<NavbarClient {...props} viewer={null} />);

    expect(shell(container).sidebar).not.toBeNull();
  });

  it("drops it when Clerk says the session ended", () => {
    userMock.mockReturnValue({ isLoaded: true, isSignedIn: false });
    const { container } = render(
      <NavbarClient {...props} viewer={{ role: "user", status: "verified" }} />,
    );

    expect(shell(container)).toEqual({ sidebar: null, tabBar: null });
  });

  it("leaves pages without navigation alone", () => {
    pathnameMock.mockReturnValue("/festivals/4/registration");
    userMock.mockReturnValue({ isLoaded: true, isSignedIn: true });
    const { container } = render(
      <NavbarClient {...props} viewer={{ role: "user", status: "verified" }} />,
    );

    expect(shell(container)).toEqual({ sidebar: null, tabBar: null });
  });

  it("keeps the bell's controls in the header either way", () => {
    userMock.mockReturnValue({ isLoaded: true, isSignedIn: true });
    render(
      <NavbarClient {...props} viewer={{ role: "user", status: "verified" }} />,
    );

    expect(screen.getByTestId("session-buttons")).toBeTruthy();
  });
});
