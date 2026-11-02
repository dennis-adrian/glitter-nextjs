import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { NavbarProfile } from "@/app/api/users/definitions";
import { buildAppNavigation } from "@/app/components/navbar/app-navigation";
import AppSidebar from "@/app/components/navbar/app-sidebar";
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
  // Radix measures its popovers; jsdom has no observer.
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

function blockedEmailsLinks() {
  return screen
    .queryAllByRole("link")
    .filter((link) => link.getAttribute("href") === "/dashboard/emails");
}

/** The desktop sidebar with every admin section opened. */
function openSidebar(role: NavbarProfile["role"]) {
  const viewer = { role, status: "verified" as const };
  render(
    <AppSidebar
      groups={buildAppNavigation({ viewer }).groups}
      profile={profile(role)}
      viewer={viewer}
    />,
  );
  for (const button of screen.queryAllByRole("button", { expanded: false })) {
    fireEvent.click(button);
  }
}

function openMobileMenu(role: NavbarProfile["role"]) {
  render(
    <MobileSidebar profile={profile(role)}>
      <span>Menú</span>
    </MobileSidebar>,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Abrir menú de navegación" }),
  );
}

describe("Correos bloqueados link", () => {
  it("is in the admin's mobile menu", () => {
    openMobileMenu("admin");
    expect(blockedEmailsLinks()).toHaveLength(1);
  });

  it("is in the admin's desktop sidebar, under Dashboard", () => {
    openSidebar("admin");
    expect(blockedEmailsLinks()).toHaveLength(1);
  });

  it("is not offered to festival admins", () => {
    openMobileMenu("festival_admin");
    expect(blockedEmailsLinks()).toHaveLength(0);
    cleanup();
    openSidebar("festival_admin");
    expect(blockedEmailsLinks()).toHaveLength(0);
  });
});
