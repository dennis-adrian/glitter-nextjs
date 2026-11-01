import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { NavbarProfile } from "@/app/api/users/definitions";
import { buildAppNavigation } from "@/app/components/navbar/app-navigation";
import AppSidebar from "@/app/components/navbar/app-sidebar";
import MoreMenu from "@/app/components/navbar/more-menu";
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

type Role = NavbarProfile["role"];

function profile(role: Role) {
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

function openMobileMenu(role: Role, communicationsEnabled: boolean) {
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

/** The desktop sidebar with every section opened. */
function openSidebar(role: Role, communicationsEnabled: boolean) {
  const viewer = { role, status: "verified" as const };
  render(
    <AppSidebar
      groups={buildAppNavigation({ viewer, communicationsEnabled }).groups}
      profile={profile(role)}
      viewer={viewer}
    />,
  );
  for (const button of screen.queryAllByRole("button", { expanded: false })) {
    fireEvent.click(button);
  }
}

function openMore(role: Role, communicationsEnabled: boolean) {
  render(
    <MoreMenu
      viewer={{ role, status: "verified" }}
      account={{ name: "Camila Rojas", imageUrl: null }}
      programsHref={null}
      blogEnabled={false}
      creditsEnabled={false}
      communicationsEnabled={communicationsEnabled}
    />,
  );
}

const MENUS = [
  ["mobile menu", openMobileMenu],
  ["desktop sidebar", openSidebar],
  ["Más", openMore],
] as const;

describe("Comunicaciones link", () => {
  for (const [name, open] of MENUS) {
    it(`is in the admin's ${name} when the flag is on`, () => {
      open("admin", true);
      expect(communicationsLinks()).toHaveLength(1);
      expect(screen.getByText("Comunicaciones")).toBeTruthy();
    });

    it(`is not in the admin's ${name} while the flag is off`, () => {
      open("admin", false);
      expect(communicationsLinks()).toHaveLength(0);
    });

    it(`is never in a festival admin's ${name}, even with the flag on`, () => {
      open("festival_admin", true);
      expect(communicationsLinks()).toHaveLength(0);
    });
  }
});
