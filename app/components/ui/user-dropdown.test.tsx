import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Reached through the menu's ProfileQuickViewInfo, whose social badges import
// the server action module and with it the server env schema. Nothing here
// invokes it.
vi.mock("@/app/lib/users/actions", () => ({
  deleteUserSocial: vi.fn(),
}));

import type { NavbarProfile } from "@/app/api/users/definitions";
import UserDropdown from "@/app/components/ui/user-dropdown";

const mocks = vi.hoisted(() => ({
  pathname: "/",
  isLoaded: true,
  isSignedIn: true as boolean | undefined,
  signOut: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({ isLoaded: mocks.isLoaded, isSignedIn: mocks.isSignedIn }),
  useClerk: () => ({ signOut: mocks.signOut }),
}));

const profile = {
  id: 1,
  clerkId: "user_123",
  displayName: "Ana Gómez",
  email: "ana@example.com",
  imageUrl: null,
  status: "verified",
  role: "user",
  participations: [],
  profileSubcategories: [],
} as unknown as NavbarProfile;

beforeEach(() => {
  mocks.pathname = "/";
  mocks.isLoaded = true;
  mocks.isSignedIn = true;
  mocks.signOut.mockReset();
  mocks.push.mockReset();

  // jsdom ships none of these; Radix's dropdown opens on pointerdown and then
  // measures and positions the portalled content.
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  vi.stubGlobal(
    "ResizeObserver",
    class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function openMenu() {
  fireEvent.pointerDown(
    screen.getByRole("button"),
    new MouseEvent("pointerdown", { bubbles: true, button: 0 }),
  );
  return within(document.body).findByRole("menu");
}

describe("UserDropdown", () => {
  it("shows the skeleton while the profile is still loading", () => {
    const { container } = render(
      <UserDropdown profile={null} creditsEnabled={false} isProfileLoading />,
    );

    expect(container.querySelector(".animate-pulse")).toBeTruthy();
    // The reduced menu must not flash in front of a profile that is simply
    // still in flight.
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText("No encontramos tu perfil")).toBeNull();
  });

  it("shows the skeleton while Clerk itself is still loading", () => {
    mocks.isLoaded = false;
    mocks.isSignedIn = undefined;

    const { container } = render(
      <UserDropdown
        profile={null}
        creditsEnabled={false}
        isProfileLoading={false}
      />,
    );

    expect(container.querySelector(".animate-pulse")).toBeTruthy();
    expect(screen.queryByText("No encontramos tu perfil")).toBeNull();
  });

  it("shows the full menu for a signed-in user with a profile", async () => {
    render(
      <UserDropdown
        profile={profile}
        creditsEnabled={false}
        isProfileLoading={false}
      />,
    );

    const menu = await openMenu();

    expect(within(menu).getByText("Mi perfil")).toBeTruthy();
    expect(within(menu).getByText("Mi historial")).toBeTruthy();
    expect(within(menu).getByText("Mis pedidos")).toBeTruthy();
    expect(within(menu).getByText("Cerrar Sesión")).toBeTruthy();
    expect(within(menu).queryByText("Revisar mi perfil")).toBeNull();
  });

  it("hides the wallet entry until credits are enabled", async () => {
    const { unmount } = render(
      <UserDropdown
        profile={profile}
        creditsEnabled={false}
        isProfileLoading={false}
      />,
    );
    expect(within(await openMenu()).queryByText("Mis créditos")).toBeNull();
    unmount();

    render(
      <UserDropdown profile={profile} creditsEnabled isProfileLoading={false} />,
    );
    expect(within(await openMenu()).getByText("Mis créditos")).toBeTruthy();
  });

  it("shows a reduced menu when the profile resolved to null", async () => {
    render(
      <UserDropdown
        profile={null}
        creditsEnabled
        isProfileLoading={false}
      />,
    );

    const menu = await openMenu();

    expect(within(menu).getByText("No encontramos tu perfil")).toBeTruthy();
    expect(
      within(menu).getByRole("menuitem", { name: /Revisar mi perfil/ }),
    ).toBeTruthy();
    // Everything that needs a profile row is gone.
    expect(within(menu).queryByText("Mi historial")).toBeNull();
    expect(within(menu).queryByText("Mis pedidos")).toBeNull();
    expect(within(menu).queryByText("Mis créditos")).toBeNull();
  });

  it("lets a user with no profile sign out", async () => {
    render(
      <UserDropdown
        profile={null}
        creditsEnabled={false}
        isProfileLoading={false}
      />,
    );

    const menu = await openMenu();
    fireEvent.click(within(menu).getByText("Cerrar Sesión"));

    expect(mocks.signOut).toHaveBeenCalledTimes(1);
  });

  it("points a user with no profile at the recovery page", async () => {
    render(
      <UserDropdown
        profile={null}
        creditsEnabled={false}
        isProfileLoading={false}
      />,
    );

    const menu = await openMenu();

    expect(
      within(menu)
        .getByRole("menuitem", { name: /Revisar mi perfil/ })
        .getAttribute("href"),
    ).toBe("/my_profile");
  });

  it("renders nothing for a signed-out visitor", () => {
    mocks.isSignedIn = false;

    const { container } = render(
      <UserDropdown
        profile={null}
        creditsEnabled={false}
        isProfileLoading={false}
      />,
    );

    expect(container.innerHTML).toBe("");
  });

  it("stays out of the festival registration flow", () => {
    mocks.pathname = "/festivals/1/registration";

    const { container } = render(
      <UserDropdown profile={null} creditsEnabled={false} isProfileLoading />,
    );

    expect(container.innerHTML).toBe("");
  });
});
