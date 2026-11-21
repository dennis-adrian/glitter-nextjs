// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import VolunteerCoverageCard from "@/app/components/volunteers/admin/volunteer-coverage-card";
import VolunteerStatsCards from "@/app/components/volunteers/admin/volunteer-stats-cards";
import type { VolunteerShiftCoverage } from "@/app/lib/volunteers/admin-definitions";

function shift(
  id: number,
  startsAt: string,
  overrides: Partial<VolunteerShiftCoverage> = {},
): VolunteerShiftCoverage {
  const start = new Date(startsAt);
  return {
    id,
    label: `Turno ${id}`,
    startsAt: start,
    endsAt: new Date(start.getTime() + 4 * 3600_000),
    neededHeadcount: 8,
    sortOrder: id,
    isActive: true,
    availableCount: 14,
    assignedCount: 4,
    ...overrides,
  };
}

afterEach(cleanup);

describe("VolunteerCoverageCard", () => {
  it("lists active shifts in time order with their meter and state", () => {
    render(
      <VolunteerCoverageCard
        shifts={[
          shift(2, "2026-12-20T21:30:00Z", {
            label: "Festival + desmontaje de mesas (turno B)",
            neededHeadcount: 10,
            assignedCount: 2,
            availableCount: 9,
          }),
          shift(1, "2026-12-18T19:00:00Z", { label: "Montaje" }),
          shift(3, "2026-12-19T14:00:00Z", { isActive: false, label: "Viejo" }),
        ]}
      />,
    );
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(rows).toHaveLength(3);
    const first = within(rows[1]);
    expect(first.getByText("Vie 18 dic · 15:00–19:00")).toBeTruthy();
    expect(first.getByText("Montaje")).toBeTruthy();
    expect(first.getByText("4 de 8")).toBeTruthy();
    expect(first.getByRole("img", { name: "4 de 8 asignados" })).toBeTruthy();
    expect(first.getByText("Faltan 4")).toBeTruthy();
    expect(
      within(rows[2]).getByText("Faltan 8, solo 9 disponibles").className,
    ).toContain("bg-red-100");
    expect(screen.queryByText("Viejo")).toBeNull();

    const phone = within(screen.getAllByRole("list")[0]);
    expect(phone.getByText("Vie 18 · 15:00–19:00")).toBeTruthy();
    expect(phone.getAllByRole("listitem")).toHaveLength(2);
  });

  it("says when there is no active shift", () => {
    render(<VolunteerCoverageCard shifts={[]} />);
    expect(screen.getByText("No hay turnos activos.")).toBeTruthy();
  });
});

describe("VolunteerStatsCards", () => {
  it("shows the five totals and marks pending ones", () => {
    render(
      <VolunteerStatsCards
        totals={{
          all: 48,
          pending: 31,
          accepted: 12,
          waitlist: 3,
          rejected: 2,
        }}
      />,
    );
    const tiles = within(
      screen.getByRole("list", { name: "Postulaciones por estado" }),
    ).getAllByRole("listitem");
    expect(tiles.map((tile) => tile.textContent)).toEqual([
      "Postulaciones48",
      "Pendientes31",
      "Aceptadas12",
      "En espera3",
      "No aceptadas2",
    ]);
    expect(tiles[1].firstElementChild?.className).toContain("border-amber-300");
  });
});
