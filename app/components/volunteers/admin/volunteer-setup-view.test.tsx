// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/lib/volunteers/admin-actions", () => ({}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/dashboard/festivals/9/volunteers/setup",
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

import { buildAppNavigation } from "@/app/components/navbar/app-navigation";
import {
  ScreenBarProvider,
  usePublishScreenContext,
} from "@/app/components/navbar/screen-bar";
import VolunteerSetupView from "@/app/components/volunteers/admin/volunteer-setup-view";

const viewer = { role: "admin", status: "verified" } as const;

/** The navbar's published context, which PageBreadcrumbs reads. */
function Navbar() {
  usePublishScreenContext({
    viewer,
    tabs: buildAppNavigation({ viewer }).tabs,
    activeFestival: null,
  });
  return null;
}

afterEach(cleanup);

const CALL = {
  festival: { id: 9, name: "Glitter v11" },
  settings: {
    applicationsCloseAt: new Date("2026-12-01T03:59:00Z"),
    inductionDate: null,
    inductionTime: null,
  },
  roles: [],
  shifts: [],
};

describe("VolunteerSetupView", () => {
  it("links back to the list and to the public page", () => {
    render(
      <ScreenBarProvider>
        <Navbar />
        <VolunteerSetupView call={CALL} />
      </ScreenBarProvider>,
    );

    const trail = screen.getByRole("navigation", { name: "Ruta" });
    expect(trail.hasAttribute("data-installed-hidden")).toBe(true);
    // The phone's single link up, then the desktop trail.
    const [back] = within(trail).getAllByRole("link", { name: "Voluntarios" });
    expect(back.getAttribute("href")).toBe("/dashboard/festivals/9/volunteers");
    expect(
      within(trail).getByRole("link", { name: "Glitter v11" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 1, name: "Roles, turnos y fechas" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "/voluntarios" }).getAttribute("href"),
    ).toBe("/voluntarios");
    expect(screen.getByText(/de Glitter v11\./)).toBeTruthy();
    for (const name of ["Fechas de la convocatoria", "Turnos", "Roles"]) {
      expect(screen.getByRole("region", { name })).toBeTruthy();
    }
    expect(screen.getByRole("button", { name: "Guardar fechas" })).toBeTruthy();
  });

  it("opens the call from the same card without settings", () => {
    render(<VolunteerSetupView call={{ ...CALL, settings: null }} />);

    expect(
      screen.getByRole("button", { name: "Abrir convocatoria" }),
    ).toBeTruthy();
  });
});
