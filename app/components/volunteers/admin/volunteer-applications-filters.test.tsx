// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
let search = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
  usePathname: () => "/dashboard/festivals/619/volunteers",
  useSearchParams: () => new URLSearchParams(search),
}));

import VolunteerApplicationsFilters, {
  clearVolunteerFiltersHref,
  volunteerFilterHref,
} from "@/app/components/volunteers/admin/volunteer-applications-filters";
import { volunteerStatusTabHref } from "@/app/components/volunteers/admin/volunteer-applications-status-tabs";
import { VolunteerApplicationsSearchSchema } from "@/app/lib/volunteers/admin-definitions";

afterEach(() => {
  cleanup();
  push.mockClear();
  search = "";
});

describe("volunteerFilterHref", () => {
  it("sets the filter and goes back to the first page", () => {
    expect(
      volunteerFilterHref("status=accepted&offset=50&limit=50", "roleId", "3"),
    ).toBe("?status=accepted&limit=50&roleId=3");
  });

  it("replaces a previous value", () => {
    expect(volunteerFilterHref("shiftId=1", "shiftId", "9")).toBe("?shiftId=9");
  });

  it("drops the filter for 'all' or null", () => {
    expect(volunteerFilterHref("roleId=3&shiftId=4", "roleId", "all")).toBe(
      "?shiftId=4",
    );
    expect(volunteerFilterHref("shiftId=4", "shiftId", null)).toBe("?");
  });
});

describe("clearVolunteerFiltersHref", () => {
  it("keeps the status and page size", () => {
    expect(
      clearVolunteerFiltersHref(
        "status=all&query=ana&roleId=1&shiftId=2&limit=50&offset=50",
      ),
    ).toBe("?status=all&limit=50");
  });
});

describe("volunteerStatusTabHref", () => {
  it("keeps the search and filters, drops the page", () => {
    expect(
      volunteerStatusTabHref(
        { query: "ana", roleId: "2", offset: "25", status: "pending" },
        "accepted",
      ),
    ).toBe("?query=ana&roleId=2&status=accepted");
  });

  it("leaves 'Por revisar' as the default", () => {
    expect(volunteerStatusTabHref({ status: "all" }, "pending")).toBe("?");
  });
});

describe("VolunteerApplicationsFilters", () => {
  const roles = [
    {
      id: 1,
      name: "Fotografía",
      description: "",
      sortOrder: 0,
      isActive: true,
    },
  ];
  const shifts = [
    {
      id: 5,
      label: "Montaje",
      startsAt: new Date("2026-12-18T19:00:00Z"),
      endsAt: new Date("2026-12-18T23:00:00Z"),
      neededHeadcount: 4,
      sortOrder: 0,
      isActive: true,
    },
  ];

  /** Renders the filters the way the page does: from the parsed URL. */
  function renderFilters() {
    const filters = VolunteerApplicationsSearchSchema.parse(
      Object.fromEntries(new URLSearchParams(search)),
    );
    return render(
      <VolunteerApplicationsFilters
        roles={roles}
        shifts={shifts}
        roleId={filters.roleId}
        shiftId={filters.shiftId}
        query={filters.query}
      />,
    );
  }

  it("labels the search, role and shift filters", () => {
    renderFilters();
    expect(
      screen.getByPlaceholderText("Buscar por nombre o correo"),
    ).toBeTruthy();
    expect(screen.getByLabelText("Rol").textContent).toContain(
      "Todos los roles",
    );
    expect(screen.getByLabelText("Turno").textContent).toContain(
      "Todos los turnos",
    );
    expect(
      screen.queryByRole("button", { name: "Limpiar filtros" }),
    ).toBeNull();
  });

  it("clears the search and filters", () => {
    search = "status=all&roleId=1&offset=25";
    renderFilters();
    expect(screen.getByLabelText("Rol").textContent).toContain("Fotografía");
    fireEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));
    expect(push).toHaveBeenCalledWith("?status=all", { scroll: false });
  });

  it("ignores a filter the server ignores", () => {
    search = "roleId=abc";
    renderFilters();
    expect(screen.getByLabelText("Rol").textContent).toContain(
      "Todos los roles",
    );
    expect(screen.queryByText("Rol #abc")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Limpiar filtros" }),
    ).toBeNull();
  });
});
