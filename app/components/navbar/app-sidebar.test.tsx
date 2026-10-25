import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { NavbarProfile } from "@/app/api/users/definitions";
import {
  buildAppNavigation,
  type NavViewer,
} from "@/app/components/navbar/app-navigation";
import AppSidebar from "@/app/components/navbar/app-sidebar";

const { pathnameMock } = vi.hoisted(() => ({ pathnameMock: vi.fn() }));

// Server actions: the sign-out path reaches them.
vi.mock("@/app/lib/notifications/push/actions", () => ({
  savePushDeviceAction: vi.fn(),
  removePushDeviceAction: vi.fn(),
  forgetPushDeviceAction: vi.fn(),
  releaseForeignPushDeviceAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: pathnameMock,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@clerk/nextjs", () => ({
  useClerk: () => ({ signOut: vi.fn() }),
}));

beforeEach(() => {
  pathnameMock.mockReturnValue("/portal");
  window.localStorage.clear();
});

afterEach(cleanup);

const profile = {
  id: 1,
  role: "admin",
  status: "verified",
  displayName: "Camila Rojas",
  imageUrl: null,
  participations: [],
  profileSubcategories: [],
} as unknown as NavbarProfile;

function renderSidebar(
  viewer: NavViewer = { role: "admin", status: "verified" },
) {
  return render(
    <AppSidebar
      groups={buildAppNavigation({ viewer, creditsEnabled: true }).groups}
      profile={profile}
      viewer={viewer}
    />,
  );
}

describe("AppSidebar", () => {
  it("shows the signed-in groups", () => {
    renderSidebar();

    for (const heading of ["Explorar", "Mi espacio", "Administración"]) {
      expect(screen.getByRole("heading", { name: heading })).toBeTruthy();
    }
  });

  it("marks the current page", () => {
    pathnameMock.mockReturnValue("/my_credits");
    renderSidebar();

    expect(
      screen
        .getByRole("link", { name: "Mis créditos" })
        .getAttribute("aria-current"),
    ).toBe("page");
  });

  it("keeps admin sections closed until opened", () => {
    renderSidebar();

    const dashboard = screen.getByRole("button", { name: /Dashboard/ });
    expect(dashboard.getAttribute("aria-expanded")).toBe("false");
    expect(
      screen.queryByRole("link", { name: "Correos bloqueados" }),
    ).toBeNull();

    fireEvent.click(dashboard);

    expect(dashboard.getAttribute("aria-expanded")).toBe("true");
    expect(
      screen.getByRole("link", { name: "Correos bloqueados" }),
    ).toBeTruthy();
  });

  it("opens the section holding the current page", () => {
    pathnameMock.mockReturnValue("/dashboard/programs/venues");
    renderSidebar();

    expect(
      screen
        .getByRole("button", { name: /Programas/ })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    expect(
      screen
        .getByRole("link", { name: "Lugares" })
        .getAttribute("aria-current"),
    ).toBe("page");
  });

  it("collapses to a rail and remembers it", () => {
    const { container } = renderSidebar();
    const aside = container.querySelector("[data-app-sidebar]")!;

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Contraer menú" }));
    });

    expect(aside.hasAttribute("data-collapsed")).toBe(true);
    expect(window.localStorage.getItem("glitter:sidebar-collapsed")).toBe("1");
    // Labels stay for screen readers when only icons show.
    expect(screen.getByRole("link", { name: "Mis créditos" })).toBeTruthy();

    cleanup();
    const again = renderSidebar();
    expect(
      again.container
        .querySelector("[data-app-sidebar]")!
        .hasAttribute("data-collapsed"),
    ).toBe(true);
  });

  it("names the account and its role", () => {
    renderSidebar();

    expect(
      screen.getByRole("button", { name: "Cuenta de Camila Rojas" })
        .textContent,
    ).toContain("Administración");
  });
});
