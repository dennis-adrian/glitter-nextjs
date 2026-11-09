import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
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

const participant: NavViewer = { role: "user", status: "verified" };
const admin: NavViewer = { role: "admin", status: "verified" };

function renderSidebar(viewer: NavViewer = participant, suppliesOpen = false) {
  return render(
    <AppSidebar
      groups={
        buildAppNavigation({
          viewer,
          creditsEnabled: true,
          suppliesOpen,
          activeFestival: { id: 9, name: "Festicker 2026", status: "active" },
        }).groups
      }
      profile={profile}
      viewer={viewer}
    />,
  );
}

describe("AppSidebar", () => {
  it("shows a participant's groups", () => {
    renderSidebar();

    for (const heading of ["Explorar", "Mi espacio"]) {
      expect(screen.getByRole("heading", { name: heading })).toBeTruthy();
    }
    expect(screen.queryByRole("heading", { name: "Operación" })).toBeNull();
  });

  it("shows staff their own groups, with the festival in progress open", () => {
    renderSidebar(admin);

    for (const heading of ["Festival en curso", "Operación"]) {
      expect(screen.getByRole("heading", { name: heading })).toBeTruthy();
    }
    expect(screen.queryByRole("heading", { name: "Explorar" })).toBeNull();
    expect(
      screen
        .getByRole("button", { name: /Festicker 2026/ })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    expect(
      screen
        .getByRole("link", { name: "Todos los festivales" })
        .getAttribute("href"),
    ).toBe("/dashboard/festivals");
  });

  it("ends with Contacto for participants and staff, outside the account menu", () => {
    for (const viewer of [participant, admin]) {
      const { unmount } = renderSidebar(viewer);
      const link = screen.getByRole("link", { name: "Contacto" });
      expect(link.getAttribute("href")).toBe("/contacto");
      unmount();
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

  it("keeps staff settings closed until opened", () => {
    renderSidebar(admin);

    const settings = screen.getByRole("button", { name: /Configuración/ });
    expect(settings.getAttribute("aria-expanded")).toBe("false");
    expect(
      screen.queryByRole("link", { name: "Correos bloqueados" }),
    ).toBeNull();

    fireEvent.click(settings);

    expect(settings.getAttribute("aria-expanded")).toBe("true");
    expect(
      screen.getByRole("link", { name: "Correos bloqueados" }),
    ).toBeTruthy();
  });

  it("opens the section holding the current page", () => {
    pathnameMock.mockReturnValue("/dashboard/programs/venues");
    renderSidebar(admin);

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
    renderSidebar(admin);

    expect(
      screen.getByRole("button", { name: "Cuenta de Camila Rojas" })
        .textContent,
    ).toContain("Administración");
  });

  it.each([
    ["a global admin", admin, true],
    [
      "a festival admin",
      { role: "festival_admin", status: "verified" } as NavViewer,
      false,
    ],
    ["a participant, or an admin viewing as one", participant, false],
  ])(
    "offers Entrar como participante in the account menu to %s: %s",
    async (_, viewer, offered) => {
      window.HTMLElement.prototype.scrollIntoView = vi.fn();
      Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
      Element.prototype.setPointerCapture = vi.fn();
      Element.prototype.releasePointerCapture = vi.fn();
      renderSidebar(viewer);
      fireEvent.pointerDown(
        screen.getByRole("button", { name: "Cuenta de Camila Rojas" }),
        new MouseEvent("pointerdown", { bubbles: true, button: 0 }),
      );
      const menu = await within(document.body).findByRole("menu");
      const item = within(menu).queryByRole("menuitem", {
        name: "Entrar como participante",
      });
      expect(item != null).toBe(offered);
      if (item)
        expect(item.getAttribute("href")).toBe("/dashboard/impersonate");
    },
  );

  it("shows Tiendita as a heading over its two stores, with no duplicate link", () => {
    pathnameMock.mockReturnValue("/supplies");
    renderSidebar({ role: "user", status: "verified" }, true);

    const stores = screen.getByRole("list", { name: "Tiendita" });
    expect(
      [...stores.querySelectorAll("a")].map((link) =>
        link.getAttribute("href"),
      ),
    ).toEqual(["/merch", "/supplies"]);
    expect(
      screen
        .getByRole("link", { name: "Mercadito de Insumos" })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(screen.queryByRole("link", { name: "Tiendita" })).toBeNull();
  });
});
