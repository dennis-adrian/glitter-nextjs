import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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

/** The desktop sidebar, with the "Gestión" section opened. */
function renderSidebar(role: NavbarProfile["role"]) {
  const viewer = { role, status: "verified" as const };
  render(
    <AppSidebar
      groups={buildAppNavigation({ viewer }).groups}
      profile={profile(role)}
      viewer={viewer}
    />,
  );
  const gestion = screen.queryByRole("button", { name: /Gestión/ });
  if (gestion) fireEvent.click(gestion);
}

function festivalsLinks() {
  return screen
    .queryAllByRole("link", { name: /Festivales/ })
    .filter((link) => link.getAttribute("href") === "/dashboard/festivals");
}

describe("Festivales link for festival admins", () => {
  it("is in the desktop sidebar", () => {
    renderSidebar("festival_admin");
    expect(festivalsLinks()).toHaveLength(1);
  });

  it("is in the mobile menu", () => {
    render(
      <MobileSidebar profile={profile("festival_admin")}>
        <span>Menú</span>
      </MobileSidebar>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Abrir menú de navegación" }),
    );
    expect(festivalsLinks()).toHaveLength(1);
  });

  it("is not offered to participants", () => {
    renderSidebar("user");
    expect(festivalsLinks()).toHaveLength(0);
  });
});
