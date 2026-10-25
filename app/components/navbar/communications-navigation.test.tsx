import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { NavbarProfile } from "@/app/api/users/definitions";
import NavbarNavigationMenu from "@/app/components/navbar/navigation-menu";
import MobileSidebar from "@/app/components/organisms/mobile-sidebar";

// Server actions: the sign-out path and the bell reach them.
vi.mock("@/app/lib/notifications/push/actions", () => ({
  savePushDeviceAction: vi.fn(),
  removePushDeviceAction: vi.fn(),
  forgetPushDeviceAction: vi.fn(),
  releaseForeignPushDeviceAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@clerk/nextjs", () => ({
  useClerk: () => ({ signOut: vi.fn() }),
  useUser: () => ({ isSignedIn: true }),
}));

beforeAll(() => {
  // Radix's navigation menu measures its viewport; jsdom has no observer.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(cleanup);

function profile(role: NavbarProfile["role"]) {
  return {
    id: 1,
    role,
    status: "verified",
    participations: [],
    profileSubcategories: [],
  } as unknown as NavbarProfile;
}

function communicationsLinks() {
  return screen
    .queryAllByRole("link")
    .filter(
      (link) => link.getAttribute("href") === "/dashboard/communications",
    );
}

function openMobileMenu(
  role: NavbarProfile["role"],
  communicationsEnabled: boolean,
) {
  render(
    <MobileSidebar
      profile={profile(role)}
      communicationsEnabled={communicationsEnabled}
    >
      <span>Menú</span>
    </MobileSidebar>,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Abrir menú de navegación" }),
  );
}

function openDesktopMenu(
  role: NavbarProfile["role"],
  communicationsEnabled: boolean,
) {
  render(
    <NavbarNavigationMenu
      profile={profile(role)}
      communicationsEnabled={communicationsEnabled}
    />,
  );
  const trigger = screen.queryByRole("button", { name: /Dashboard/ });
  if (trigger) fireEvent.click(trigger);
}

describe("Comunicaciones link", () => {
  it("is in the admin's mobile menu when the flag is on", () => {
    openMobileMenu("admin", true);
    expect(communicationsLinks()).toHaveLength(1);
  });

  it("is in the admin's desktop Dashboard menu when the flag is on", () => {
    openDesktopMenu("admin", true);
    expect(communicationsLinks()).toHaveLength(1);
    expect(screen.getByText("Comunicaciones")).toBeTruthy();
  });

  it("is not there for an admin while the flag is off", () => {
    openMobileMenu("admin", false);
    expect(communicationsLinks()).toHaveLength(0);
    cleanup();
    openDesktopMenu("admin", false);
    expect(communicationsLinks()).toHaveLength(0);
  });

  it("is never offered to festival admins, even with the flag on", () => {
    openMobileMenu("festival_admin", true);
    expect(communicationsLinks()).toHaveLength(0);
    cleanup();
    openDesktopMenu("festival_admin", true);
    expect(communicationsLinks()).toHaveLength(0);
  });
});
