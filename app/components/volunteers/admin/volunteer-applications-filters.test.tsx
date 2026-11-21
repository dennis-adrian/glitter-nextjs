// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
  usePathname: () => "/dashboard/festivals/619/volunteers",
  useSearchParams: () => new URLSearchParams(),
}));

import VolunteerApplicationsFilters from "@/app/components/volunteers/admin/volunteer-applications-filters";
import type { RawSearchParams } from "@/app/lib/credits/admin-definitions";
import {
  VolunteerApplicationsSearchSchema,
  type VolunteerAdminRole,
  type VolunteerAdminShift,
} from "@/app/lib/volunteers/admin-definitions";

const BASE = "/dashboard/festivals/619/volunteers";

const roles: VolunteerAdminRole[] = [
  {
    id: 1,
    name: "Fotografía y redes sociales",
    description: "",
    sortOrder: 1,
    isActive: true,
    choiceCount: 4,
  },
];
const shifts: VolunteerAdminShift[] = [
  {
    id: 5,
    label: "Montaje",
    startsAt: new Date("2026-12-18T19:00:00Z"),
    endsAt: new Date("2026-12-18T23:00:00Z"),
    neededHeadcount: 4,
    sortOrder: 1,
    isActive: true,
  },
];
const counts = { all: 9, pending: 4, accepted: 3, waitlist: 1, rejected: 1 };

function renderFilters(searchParams: RawSearchParams = {}) {
  return render(
    <VolunteerApplicationsFilters
      basePath={BASE}
      searchParams={searchParams}
      filters={VolunteerApplicationsSearchSchema.parse(searchParams)}
      counts={counts}
      roles={roles}
      shifts={shifts}
    />,
  );
}

afterEach(() => {
  cleanup();
  push.mockClear();
  vi.useRealTimers();
});

describe("VolunteerApplicationsFilters", () => {
  it("links a chip per status with its count, Todas current by default", () => {
    renderFilters({ query: "ana", offset: "25" });
    const nav = within(
      screen.getByRole("navigation", { name: "Estado de las postulaciones" }),
    );
    const all = nav.getByRole("link", { name: "Todas 9" });
    expect(all.getAttribute("aria-current")).toBe("page");
    expect(all.getAttribute("href")).toBe(`${BASE}?query=ana`);
    const pending = nav.getByRole("link", { name: "Pendientes 4" });
    expect(pending.getAttribute("aria-current")).toBeNull();
    expect(pending.getAttribute("href")).toBe(
      `${BASE}?query=ana&status=pending`,
    );
    expect(nav.getByRole("link", { name: "No aceptadas 1" })).toBeTruthy();
  });

  it("labels the search and the two filters, with nothing to clear", () => {
    renderFilters();
    const search = screen.getByLabelText("Buscar postulaciones");
    expect(search.getAttribute("placeholder")).toBe(
      "Buscar por nombre, celular o correo",
    );
    expect(
      screen.getByRole("button", { name: "Turno disponible" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Rol preferido" })).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /Limpiar filtros/ }),
    ).toBeNull();
  });

  it("shows the active filters and clears them, keeping the status", () => {
    renderFilters({
      status: "accepted",
      roleId: "1",
      shiftId: "5",
      offset: "25",
    });
    expect(
      screen.getByRole("button", {
        name: "Rol preferido: Fotografía y redes sociales",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Turno disponible: Vie 18 15:00" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Limpiar filtros/ }));
    expect(push).toHaveBeenCalledWith(`${BASE}?status=accepted`, {
      scroll: false,
    });
  });

  it("names a filter left in the URL for a role that is gone", () => {
    renderFilters({ roleId: "42" });
    expect(
      screen.getByRole("button", { name: "Rol preferido: Rol #42" }),
    ).toBeTruthy();
  });

  it("ignores a filter the server ignores", () => {
    renderFilters({ roleId: "abc" });
    expect(screen.getByRole("button", { name: "Rol preferido" })).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /Limpiar filtros/ }),
    ).toBeNull();
  });

  it("pushes the search after a pause, back on the first page", () => {
    vi.useFakeTimers();
    renderFilters({ status: "pending", offset: "25" });
    fireEvent.change(screen.getByLabelText("Buscar postulaciones"), {
      target: { value: " 7000 " },
    });
    expect(push).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(450);
    });
    expect(push).toHaveBeenCalledWith(`${BASE}?status=pending&query=7000`, {
      scroll: false,
    });
  });
});
