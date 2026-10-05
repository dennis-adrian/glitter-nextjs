import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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

function festivalsLinks() {
  return screen
    .queryAllByRole("link", { name: /Festivales/ })
    .filter((link) => link.getAttribute("href") === "/dashboard/festivals");
}

describe("Festivales link for festival admins", () => {
  it("is in the desktop menu", () => {
    render(<NavbarNavigationMenu profile={profile("festival_admin")} />);
    expect(festivalsLinks()).toHaveLength(1);
  });

  it("is in the mobile menu", () => {
    render(
      <MobileSidebar profile={profile("festival_admin")}>
        <span>Menú</span>
      </MobileSidebar>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Abrir menú de navegación" }));
    expect(festivalsLinks()).toHaveLength(1);
  });

  it("is not offered to participants", () => {
    render(<NavbarNavigationMenu profile={profile("user")} />);
    expect(festivalsLinks()).toHaveLength(0);
  });
});
