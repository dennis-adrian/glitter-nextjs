// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/dashboard/festivals/619/volunteers",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/app/lib/volunteers/admin-actions", () => ({
  updateVolunteerApplicationStatus: vi.fn(),
}));

import VolunteerApplicationsList, {
  volunteerApplicationsEmptyMessage,
  volunteerApplicationsSummary,
} from "@/app/components/volunteers/admin/volunteer-applications-list";
import type { RawSearchParams } from "@/app/lib/credits/admin-definitions";
import {
  VolunteerApplicationsSearchSchema,
  type VolunteerAdminRole,
  type VolunteerAdminShift,
  type VolunteerApplicationListItem,
} from "@/app/lib/volunteers/admin-definitions";

const BASE = "/dashboard/festivals/619/volunteers";
const TODAY = new Date("2026-11-21T16:00:00Z");

const roles: VolunteerAdminRole[] = [
  {
    id: 1,
    name: "Fotografía y redes sociales",
    description: "",
    sortOrder: 1,
    isActive: true,
    choiceCount: 3,
  },
  {
    id: 2,
    name: "Orientación al público",
    description: "",
    sortOrder: 2,
    isActive: true,
    choiceCount: 1,
  },
  {
    id: 3,
    name: "Montaje y desmontaje",
    description: "",
    sortOrder: 3,
    isActive: true,
    choiceCount: 1,
  },
];

function shift(
  id: number,
  startsAt: string,
  label: string,
): VolunteerAdminShift {
  const start = new Date(startsAt);
  return {
    id,
    label,
    startsAt: start,
    endsAt: new Date(start.getTime() + 4 * 3600_000),
    neededHeadcount: 4,
    sortOrder: id,
    isActive: true,
  };
}
const shifts = [
  shift(1, "2026-12-18T19:00:00Z", "Montaje"),
  shift(2, "2026-12-19T17:30:00Z", "Festival (turno A)"),
  shift(3, "2026-12-20T17:30:00Z", "Festival (turno A)"),
];

function item(
  overrides: Partial<VolunteerApplicationListItem> = {},
): VolunteerApplicationListItem {
  return {
    id: 42,
    fullName: "María Fernanda Quispe Mamani de la Cruz",
    email: "maria.fernanda.quispe.mamani.delacruz@example.com",
    phone: "+591 70000001",
    birthdate: "2004-11-01",
    status: "pending",
    firstChoiceRoleId: 1,
    secondChoiceRoleId: 2,
    assignedRoleId: null,
    firstChoiceRoleName: "Fotografía y redes sociales",
    secondChoiceRoleName: "Orientación al público",
    assignedRoleName: null,
    availableShiftIds: [1, 2],
    assignedShiftIds: [],
    createdAt: new Date("2026-11-03T02:30:00Z"),
    ...overrides,
  };
}

function renderList(
  items: VolunteerApplicationListItem[],
  searchParams: RawSearchParams = {},
  total = items.length,
) {
  return render(
    <VolunteerApplicationsList
      festivalId={619}
      basePath={BASE}
      searchParams={searchParams}
      items={items}
      total={total}
      filters={VolunteerApplicationsSearchSchema.parse(searchParams)}
      roles={roles}
      shifts={shifts}
      today={TODAY}
    />,
  );
}

afterEach(cleanup);

describe("VolunteerApplicationsList", () => {
  it("renders a table row per application", () => {
    renderList([item()]);
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(rows).toHaveLength(2);
    const row = within(rows[1]);
    expect(
      row
        .getByRole("link", { name: "María Fernanda Quispe Mamani de la Cruz" })
        .getAttribute("href"),
    ).toBe(`${BASE}/42`);
    expect(row.getByText("22 años · +591 70000001")).toBeTruthy();
    expect(row.getByText("Vie 18 15:00 · Sáb 19 13:30")).toBeTruthy();
    expect(row.getByText("1ª Fotografía y redes sociales")).toBeTruthy();
    expect(row.getByText("2ª Orientación al público")).toBeTruthy();
    expect(row.getByText("Pendiente")).toBeTruthy();
    expect(row.getByText("Sin asignar")).toBeTruthy();
    expect(
      row
        .getByRole("link", {
          name: "Escribir por WhatsApp a María Fernanda Quispe Mamani de la Cruz",
        })
        .getAttribute("href"),
    ).toBe("https://wa.me/59170000001");
    expect(
      row.getByRole("button", {
        name: "Más acciones para María Fernanda Quispe Mamani de la Cruz",
      }),
    ).toBeTruthy();
  });

  it("shows the assignment only once accepted, and every shift as 'Los N turnos'", () => {
    renderList([
      item({
        id: 1,
        status: "accepted",
        assignedRoleId: 3,
        assignedRoleName: "Montaje y desmontaje",
        availableShiftIds: [1, 2, 3],
        assignedShiftIds: [3, 1],
      }),
      item({
        id: 2,
        status: "waitlist",
        assignedRoleName: "Montaje y desmontaje",
        assignedShiftIds: [1],
      }),
    ]);
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    const accepted = within(rows[1]);
    expect(accepted.getByText("Los 3 turnos")).toBeTruthy();
    expect(accepted.getByText("Montaje y desmontaje")).toBeTruthy();
    expect(accepted.getByText("Vie 18 15:00 · Dom 20 13:30")).toBeTruthy();
    const waiting = within(rows[2]);
    expect(waiting.getByText("En espera")).toBeTruthy();
    expect(waiting.getByText("Sin asignar")).toBeTruthy();
    expect(waiting.queryByText("Montaje y desmontaje")).toBeNull();
  });

  it("renders a phone card per application that wraps long values", () => {
    renderList([
      item({ id: 7 }),
      item({
        id: 8,
        status: "accepted",
        assignedRoleName: "Montaje y desmontaje",
        assignedShiftIds: [2],
      }),
    ]);
    const cards = within(screen.getByRole("list", { name: "Postulaciones" }))
      .getAllByRole("listitem")
      .map((card) => within(card));
    const name = cards[0].getByRole("link", {
      name: "María Fernanda Quispe Mamani de la Cruz",
    });
    expect(name.getAttribute("href")).toBe(`${BASE}/7`);
    expect(name.className).toContain("wrap-anywhere");
    expect(
      cards[0].getByText(
        "1ª Fotografía y redes sociales · 2ª Orientación al público",
      ),
    ).toBeTruthy();
    expect(
      cards[0].getByText("Disponible: Vie 18 15:00 · Sáb 19 13:30"),
    ).toBeTruthy();
    expect(cards[1].getByText("Asignada: Montaje y desmontaje")).toBeTruthy();
    expect(cards[1].getByText("Turnos: Sáb 19 13:30")).toBeTruthy();
    expect(
      cards[1].getByRole("link", { name: /^Escribir por WhatsApp a / })
        .className,
    ).toContain("size-11");
  });

  it("shows the empty state for the chip, or for the filters", () => {
    renderList([]);
    expect(
      screen.getByText("Todavía no llegó ninguna postulación."),
    ).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    cleanup();

    renderList([], { status: "pending", query: "ana" });
    expect(
      screen.getByText(
        "Ninguna postulación coincide con la búsqueda y los filtros.",
      ),
    ).toBeTruthy();
  });

  it("says the page ran out, not that there is nothing, past the last page", () => {
    renderList([], { offset: "50" }, 3);
    expect(
      screen.getByText("No hay más postulaciones en esta página."),
    ).toBeTruthy();
  });

  it("pages with Anterior and Siguiente, keeping the filters", () => {
    renderList([item()], { roleId: "1", offset: "25" }, 60);
    const pages = within(screen.getByRole("navigation", { name: "Páginas" }));
    expect(
      pages.getByRole("link", { name: "Anterior" }).getAttribute("href"),
    ).toBe(`${BASE}?roleId=1`);
    expect(
      pages.getByRole("link", { name: "Siguiente" }).getAttribute("href"),
    ).toBe(`${BASE}?roleId=1&offset=50`);
    expect(
      screen.getByText(
        "Mostrando 26 de 60 postulaciones con Fotografía y redes sociales como rol preferido",
      ),
    ).toBeTruthy();
    cleanup();

    renderList([item()]);
    const only = within(screen.getByRole("navigation", { name: "Páginas" }));
    expect(
      (only.getByRole("button", { name: "Anterior" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (only.getByRole("button", { name: "Siguiente" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(screen.getByText("Mostrando 1 de 1 postulación")).toBeTruthy();
  });
});

describe("volunteerApplicationsSummary", () => {
  it("names both filters", () => {
    expect(
      volunteerApplicationsSummary({
        shown: 5,
        total: 9,
        offset: 0,
        filters: VolunteerApplicationsSearchSchema.parse({
          roleId: "1",
          shiftId: "1",
        }),
        roles,
        shifts,
      }),
    ).toBe(
      "Mostrando 5 de 9 postulaciones con Fotografía y redes sociales como rol preferido y Vie 18 dic · 15:00–19:00 (Montaje) como turno disponible",
    );
  });
});

describe("volunteerApplicationsEmptyMessage", () => {
  it("names each chip", () => {
    const parse = (raw: RawSearchParams) =>
      VolunteerApplicationsSearchSchema.parse(raw);
    expect(
      volunteerApplicationsEmptyMessage(parse({ status: "pending" })),
    ).toBe("No hay postulaciones pendientes.");
    expect(
      volunteerApplicationsEmptyMessage(parse({ status: "rejected" })),
    ).toBe("No hay postulaciones no aceptadas.");
    expect(volunteerApplicationsEmptyMessage(parse({ shiftId: "3" }))).toBe(
      "Ninguna postulación coincide con la búsqueda y los filtros.",
    );
  });
});
