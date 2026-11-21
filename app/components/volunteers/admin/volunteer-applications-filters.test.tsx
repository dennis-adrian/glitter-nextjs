// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import VolunteerApplicationsFilters from "@/app/components/volunteers/admin/volunteer-applications-filters";
import type { RawSearchParams } from "@/app/lib/credits/admin-definitions";
import { VolunteerApplicationsSearchSchema } from "@/app/lib/volunteers/admin-definitions";

const BASE = "/dashboard/festivals/619/volunteers";
const counts = { all: 9, pending: 4, accepted: 3, waitlist: 1, rejected: 1 };

function renderFilters(searchParams: RawSearchParams = {}) {
  return render(
    <VolunteerApplicationsFilters
      basePath={BASE}
      searchParams={searchParams}
      filters={VolunteerApplicationsSearchSchema.parse(searchParams)}
      counts={counts}
    />,
  );
}

function chips() {
  return within(
    screen.getByRole("navigation", { name: "Estado de las postulaciones" }),
  );
}

afterEach(cleanup);

describe("VolunteerApplicationsFilters", () => {
  it("links a chip per status with its count, Todas current by default", () => {
    renderFilters({ query: "ana", offset: "25" });
    const all = chips().getByRole("link", { name: "Todas 9" });
    expect(all.getAttribute("aria-current")).toBe("page");
    expect(all.getAttribute("href")).toBe(`${BASE}?query=ana`);
    const pending = chips().getByRole("link", { name: "Pendientes 4" });
    expect(pending.getAttribute("aria-current")).toBeNull();
    expect(pending.getAttribute("href")).toBe(
      `${BASE}?query=ana&status=pending`,
    );
    expect(chips().getByRole("link", { name: "No aceptadas 1" })).toBeTruthy();
  });

  it("keeps the table's search, filters and page size, back on page one", () => {
    renderFilters({
      status: "accepted",
      roleId: "1",
      shiftId: "5",
      limit: "50",
      offset: "25",
    });
    expect(
      chips()
        .getByRole("link", { name: "Aceptadas 3" })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(
      chips().getByRole("link", { name: "En espera 1" }).getAttribute("href"),
    ).toBe(`${BASE}?roleId=1&shiftId=5&limit=50&status=waitlist`);
  });
});
