import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { NavbarProfile } from "@/app/api/users/definitions";
import NavbarNavigationMenu from "@/app/components/navbar/navigation-menu";
import MobileSidebar from "@/app/components/organisms/mobile-sidebar";

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

function blockedEmailsLinks() {
  return screen
    .queryAllByRole("link")
    .filter((link) => link.getAttribute("href") === "/dashboard/emails");
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

  it("is in the admin's desktop Dashboard menu", () => {
    render(<NavbarNavigationMenu profile={profile("admin")} />);
    fireEvent.click(screen.getByRole("button", { name: /Dashboard/ }));
    expect(blockedEmailsLinks()).toHaveLength(1);
  });

  it("is not offered to festival admins", () => {
    openMobileMenu("festival_admin");
    expect(blockedEmailsLinks()).toHaveLength(0);
    cleanup();
    render(<NavbarNavigationMenu profile={profile("festival_admin")} />);
    expect(blockedEmailsLinks()).toHaveLength(0);
  });
});
