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

const nav = vi.hoisted(() => ({
  push: vi.fn(),
  search: new URLSearchParams(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, refresh: vi.fn() }),
  usePathname: () => "/dashboard/festivals/619/volunteers",
  useSearchParams: () => nav.search,
}));
vi.mock("@/app/lib/volunteers/admin-actions", () => ({
  updateVolunteerApplicationStatus: vi.fn(),
}));

import VolunteerApplicationsList, {
  volunteerApplicationsEmptyMessage,
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
  nav.search = new URLSearchParams(
    Object.entries(searchParams).flatMap(([key, value]) =>
      (Array.isArray(value) ? value : value ? [value] : []).map((v) => [
        key,
        v,
      ]),
    ),
  );
  return render(
    <VolunteerApplicationsList
      festivalId={619}
      items={items}
      total={total}
      filters={VolunteerApplicationsSearchSchema.parse(searchParams)}
      roles={roles}
      shifts={shifts}
      today={TODAY}
    />,
  );
}

/** DataTable's phone list: a card per application, below md. */
function phoneCards() {
  const table = screen.getByRole("table");
  const list = screen
    .getAllByRole("list")
    .find((candidate) => !table.contains(candidate));
  if (!list) throw new Error("no phone list");
  return list;
}

afterEach(() => {
  cleanup();
  nav.push.mockReset();
  vi.useRealTimers();
});

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
    const cards = within(phoneCards())
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
    // Once in the table and once in the phone list.
    expect(
      screen.getAllByText("Todavía no llegó ninguna postulación."),
    ).toHaveLength(2);
    cleanup();

    renderList([], { status: "pending", query: "ana" });
    expect(
      screen.getAllByText(
        "Ninguna postulación coincide con la búsqueda y los filtros.",
      ),
    ).toHaveLength(2);
    expect(
      (
        screen.getByRole("searchbox", {
          name: "Buscar por nombre, celular o correo",
        }) as HTMLInputElement
      ).value,
    ).toBe("ana");
  });

  it("says the page ran out, not that there is nothing, past the last page", () => {
    renderList([], { offset: "50" }, 3);
    expect(
      screen.getAllByText("No hay más postulaciones en esta página."),
    ).toHaveLength(2);
  });

  it("pages through the URL, keeping the filters", () => {
    renderList([item()], { roleId: "1", offset: "25" }, 60);
    expect(screen.getByText("26–50 de 60")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Página siguiente" }));
    expect(nav.push).toHaveBeenCalledWith(
      `${BASE}?roleId=1&offset=50&limit=25`,
      { scroll: false },
    );
  });

  it("pushes the search after a pause, back on the first page", () => {
    vi.useFakeTimers();
    renderList([item()], { status: "pending", offset: "25" }, 30);
    fireEvent.change(
      screen.getByRole("searchbox", {
        name: "Buscar por nombre, celular o correo",
      }),
      { target: { value: " 7000 " } },
    );
    expect(nav.push).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(450);
    });
    expect(nav.push).toHaveBeenCalledWith(`${BASE}?status=pending&query=7000`, {
      scroll: false,
    });
  });

  it("filters by shift and role through shiftId and roleId", () => {
    renderList([item()], { shiftId: "2", roleId: "1" });
    // The trigger names the value; a removable chip repeats it in full.
    const [shiftTrigger] = screen.getAllByRole("button", {
      name: /^Turno disponible/,
    });
    expect(shiftTrigger.textContent).toContain(
      "Sáb 19 dic · 13:30–17:30 — Festival (turno A)",
    );
    const [roleTrigger] = screen.getAllByRole("button", {
      name: /^Rol preferido/,
    });
    expect(roleTrigger.textContent).toContain("Fotografía y redes sociales");
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
