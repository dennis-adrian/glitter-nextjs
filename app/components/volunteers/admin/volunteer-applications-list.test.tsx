// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/dashboard/festivals/619/volunteers",
  useSearchParams: () => new URLSearchParams(),
}));

import VolunteerApplicationsList, {
  volunteerApplicationsEmptyMessage,
} from "@/app/components/volunteers/admin/volunteer-applications-list";
import {
  VolunteerApplicationsSearchSchema,
  type VolunteerApplicationListItem,
} from "@/app/lib/volunteers/admin-definitions";

function item(
  overrides: Partial<VolunteerApplicationListItem> = {},
): VolunteerApplicationListItem {
  return {
    id: 42,
    fullName: "María Fernanda Quispe Mamani de la Cruz",
    email: "maria.fernanda.quispe.mamani.delacruz@example.com",
    phone: "+591 71234567",
    status: "pending",
    firstChoiceRoleName: "Fotografía",
    secondChoiceRoleName: "Atención al público",
    assignedRoleName: null,
    availableShiftCount: 3,
    assignedShiftCount: 0,
    // 02:30 UTC is still the 2nd in La Paz (UTC-4).
    createdAt: new Date("2026-11-03T02:30:00Z"),
    ...overrides,
  };
}

const filters = (raw: Record<string, string> = {}) =>
  VolunteerApplicationsSearchSchema.parse(raw);

function renderList(
  items: VolunteerApplicationListItem[],
  raw: Record<string, string> = {},
  total = items.length,
) {
  return render(
    <VolunteerApplicationsList
      festivalId={619}
      items={items}
      total={total}
      filters={filters(raw)}
    />,
  );
}

afterEach(cleanup);

describe("VolunteerApplicationsList", () => {
  it("renders a table row per application, linking to it", () => {
    renderList([item()]);
    const table = within(screen.getByRole("table"));
    const rows = table.getAllByRole("row");
    expect(rows).toHaveLength(2);
    const row = within(rows[1]);
    expect(
      row
        .getByRole("link", { name: "María Fernanda Quispe Mamani de la Cruz" })
        .getAttribute("href"),
    ).toBe("/dashboard/festivals/619/volunteers/42");
    expect(
      row
        .getByRole("link", {
          name: "Ver la postulación de María Fernanda Quispe Mamani de la Cruz",
        })
        .getAttribute("href"),
    ).toBe("/dashboard/festivals/619/volunteers/42");
    expect(row.getByText("Fotografía")).toBeTruthy();
    expect(row.getByText("Atención al público")).toBeTruthy();
    expect(row.getByText("3 turnos")).toBeTruthy();
    expect(row.getByText("Por revisar")).toBeTruthy();
    expect(row.getByText("—")).toBeTruthy();
    expect(row.getByText(/2 nov 2026/)).toBeTruthy();
  });

  it("shows the assignment only once accepted", () => {
    renderList([
      item({
        id: 1,
        status: "accepted",
        assignedRoleName: "Prensa",
        assignedShiftCount: 1,
      }),
      item({
        id: 2,
        status: "waitlist",
        assignedRoleName: "Prensa",
        assignedShiftCount: 2,
      }),
    ]);
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(within(rows[1]).getByText("Prensa · 1 turno")).toBeTruthy();
    expect(within(rows[2]).queryByText(/Prensa ·/)).toBeNull();
  });

  it("renders a phone card per application that wraps long values", () => {
    renderList([item({ status: "accepted", assignedShiftCount: 2 })]);
    const cards = within(screen.getByRole("list", { name: "Postulaciones" }));
    const card = cards.getByRole("link");
    expect(card.getAttribute("href")).toBe(
      "/dashboard/festivals/619/volunteers/42",
    );
    const name = within(card).getByText(
      "María Fernanda Quispe Mamani de la Cruz",
    );
    expect(name.className).toContain("break-words");
    expect(name.parentElement.className).toContain("min-w-0");
    expect(
      within(card).getByText(
        "maria.fernanda.quispe.mamani.delacruz@example.com",
      ).className,
    ).toContain("wrap-anywhere");
    expect(within(card).getByText("Sin rol · 2 turnos")).toBeTruthy();
    expect(within(card).getByText("Aceptada")).toBeTruthy();
  });

  it("shows the empty state for the tab, or for the filters", () => {
    renderList([]);
    expect(screen.getByText("No hay postulaciones por revisar.")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    cleanup();

    renderList([], { status: "all", query: "ana" });
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
    expect(screen.queryByText("No hay postulaciones por revisar.")).toBeNull();
  });

  it("pages with the volunteer page sizes", () => {
    renderList([item()], { limit: "25", offset: "25" }, 60);
    expect(screen.getByText(/2 de 3/)).toBeTruthy();
  });
});

describe("volunteerApplicationsEmptyMessage", () => {
  it("names each tab", () => {
    expect(
      volunteerApplicationsEmptyMessage(filters({ status: "accepted" })),
    ).toBe("Todavía no hay postulaciones aceptadas.");
    expect(volunteerApplicationsEmptyMessage(filters({ status: "all" }))).toBe(
      "Todavía no llegó ninguna postulación.",
    );
    expect(volunteerApplicationsEmptyMessage(filters({ roleId: "3" }))).toBe(
      "Ninguna postulación coincide con la búsqueda y los filtros.",
    );
  });
});
