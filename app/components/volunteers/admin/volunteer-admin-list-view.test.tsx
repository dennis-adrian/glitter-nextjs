// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/dashboard/festivals/11/volunteers",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/app/lib/volunteers/admin-actions", () => ({
  updateVolunteerApplicationStatus: vi.fn(),
}));

import VolunteerAdminListView, {
  volunteerListDescription,
} from "@/app/components/volunteers/admin/volunteer-admin-list-view";
import {
  VolunteerApplicationsSearchSchema,
  type VolunteerAdminCall,
} from "@/app/lib/volunteers/admin-definitions";

const totals = { all: 0, pending: 0, accepted: 0, waitlist: 0, rejected: 0 };
const CALL: VolunteerAdminCall = {
  festival: { id: 11, name: "Glitter v11" },
  // 03:59 UTC on Dec 1 is 23:59 on Nov 30 in La Paz.
  settings: {
    applicationsCloseAt: new Date("2026-12-01T03:59:00Z"),
    inductionDate: null,
    inductionTime: null,
  },
  roles: [],
  shifts: [],
  statusTotals: totals,
};
const NOW = new Date("2026-11-21T16:00:00Z");

afterEach(cleanup);

describe("volunteerListDescription", () => {
  it("names the festival and when the call closes, on La Paz's clock", () => {
    expect(volunteerListDescription(CALL, NOW)).toBe(
      "Postulaciones para Glitter v11. La convocatoria cierra el lunes 30 de noviembre a las 23:59.",
    );
    expect(
      volunteerListDescription(CALL, new Date("2026-12-02T00:00:00Z")),
    ).toContain("La convocatoria cerró el lunes 30 de noviembre");
    expect(volunteerListDescription({ ...CALL, settings: null }, NOW)).toBe(
      "Postulaciones para Glitter v11.",
    );
  });
});

describe("VolunteerAdminListView", () => {
  const filters = VolunteerApplicationsSearchSchema.parse({});

  it("links the setup and the CSV export", () => {
    render(
      <VolunteerAdminListView
        call={CALL}
        page={{ items: [], total: 0, counts: totals }}
        filters={filters}
        searchParams={{}}
        today={NOW}
      />,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Voluntarios" }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Roles, turnos y fechas" })
        .getAttribute("href"),
    ).toBe("/dashboard/festivals/11/volunteers/setup");
    const csv = screen.getByRole("link", { name: "Exportar CSV" });
    expect(csv.getAttribute("href")).toBe(
      "/dashboard/festivals/11/volunteers/export",
    );
    expect(csv.hasAttribute("download")).toBe(true);
    expect(
      screen.getByRole("heading", { name: "Cobertura por turno" }),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Postulaciones" })).toBeTruthy();
  });

  it("switches phones between the applications and the coverage", () => {
    const { rerender } = render(
      <VolunteerAdminListView
        call={CALL}
        page={{ items: [], total: 0, counts: totals }}
        filters={filters}
        searchParams={{ status: "pending" }}
        today={NOW}
      />,
    );
    const nav = screen.getByRole("navigation", {
      name: "Vistas de voluntarios",
    });
    expect(nav.className).toContain("md:hidden");
    const applications = screen.getByRole("link", { name: "Postulaciones" });
    const coverage = screen.getByRole("link", { name: "Cobertura" });
    expect(applications.getAttribute("aria-current")).toBe("page");
    expect(coverage.getAttribute("aria-current")).toBeNull();
    expect(coverage.getAttribute("href")).toBe(
      "/dashboard/festivals/11/volunteers?status=pending&view=cobertura",
    );
    const coverageCard = () =>
      screen.getByRole("region", { name: "Cobertura por turno" });
    const applicationsCard = () =>
      screen.getByRole("region", { name: "Postulaciones" });
    expect(coverageCard().className).toContain("max-md:hidden");
    expect(applicationsCard().className).not.toContain("max-md:hidden");

    rerender(
      <VolunteerAdminListView
        call={CALL}
        page={{ items: [], total: 0, counts: totals }}
        filters={filters}
        searchParams={{ status: "pending", view: "cobertura" }}
        view="cobertura"
        today={NOW}
      />,
    );
    expect(
      screen
        .getByRole("link", { name: "Cobertura" })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(
      screen.getByRole("link", { name: "Postulaciones" }).getAttribute("href"),
    ).toBe("/dashboard/festivals/11/volunteers?status=pending");
    expect(coverageCard().className).not.toContain("max-md:hidden");
    expect(applicationsCard().className).toContain("max-md:hidden");
  });

  it("leads to the setup without a call", () => {
    render(
      <VolunteerAdminListView
        call={{ ...CALL, settings: null }}
        page={null}
        filters={filters}
        searchParams={{}}
        today={NOW}
      />,
    );
    expect(
      screen
        .getByRole("link", { name: "Configurá la convocatoria" })
        .getAttribute("href"),
    ).toBe("/dashboard/festivals/11/volunteers/setup");
    expect(screen.queryByRole("link", { name: "Exportar CSV" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Postulaciones" })).toBeNull();
    expect(
      screen.queryByRole("navigation", { name: "Vistas de voluntarios" }),
    ).toBeNull();
  });
});
