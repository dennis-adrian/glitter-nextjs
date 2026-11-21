import { describe, expect, it } from "vitest";

import {
  clearVolunteerFiltersHref,
  formatShiftList,
  formatShiftStartShort,
  shiftFilterLabel,
  volunteerAgeAndPhone,
  volunteerListHref,
  volunteerStatusHref,
} from "@/app/components/volunteers/admin/volunteer-admin-list-params";
import type { VolunteerAdminShift } from "@/app/lib/volunteers/admin-definitions";

const BASE = "/dashboard/festivals/619/volunteers";

function shift(
  id: number,
  startsAt: string,
  overrides: Partial<VolunteerAdminShift> = {},
): VolunteerAdminShift {
  const start = new Date(startsAt);
  return {
    id,
    label: `Turno ${id}`,
    startsAt: start,
    endsAt: new Date(start.getTime() + 4 * 3600_000),
    neededHeadcount: 4,
    sortOrder: id,
    isActive: true,
    ...overrides,
  };
}

// 19:00 UTC is 15:00 in La Paz (UTC-4).
const SHIFTS = [
  shift(3, "2026-12-19T17:30:00Z"),
  shift(1, "2026-12-18T19:00:00Z"),
  shift(2, "2026-12-19T14:00:00Z"),
];

describe("volunteerListHref", () => {
  it("applies the change and goes back to the first page", () => {
    expect(
      volunteerListHref(
        BASE,
        { status: "accepted", offset: "50", limit: "50" },
        { roleId: "3" },
      ),
    ).toBe(`${BASE}?status=accepted&limit=50&roleId=3`);
  });

  it("drops a parameter set to null, and keeps an offset it is given", () => {
    expect(
      volunteerListHref(BASE, { roleId: "3", shiftId: "4" }, { roleId: null }),
    ).toBe(`${BASE}?shiftId=4`);
    expect(volunteerListHref(BASE, { query: "ana" }, { offset: "25" })).toBe(
      `${BASE}?query=ana&offset=25`,
    );
    expect(volunteerListHref(BASE, { offset: "25" }, { offset: null })).toBe(
      BASE,
    );
  });

  it("links the status chips, with Todas as the default", () => {
    expect(
      volunteerStatusHref(BASE, { status: "pending", query: "ana" }, "all"),
    ).toBe(`${BASE}?query=ana`);
    expect(volunteerStatusHref(BASE, {}, "waitlist")).toBe(
      `${BASE}?status=waitlist`,
    );
  });

  it("clears the search and filters but keeps the status", () => {
    expect(
      clearVolunteerFiltersHref(BASE, {
        status: "accepted",
        query: "ana",
        roleId: "1",
        shiftId: "2",
        offset: "25",
      }),
    ).toBe(`${BASE}?status=accepted`);
  });
});

describe("formatShiftList", () => {
  it("lists the shifts by start time on La Paz's clock", () => {
    expect(formatShiftStartShort(SHIFTS[1])).toBe("Vie 18 15:00");
    expect(formatShiftList([3, 1], SHIFTS)).toBe("Vie 18 15:00 · Sáb 19 13:30");
  });

  it("says 'Los N turnos' when every active shift is marked", () => {
    expect(formatShiftList([1, 2, 3], SHIFTS, { all: true })).toBe(
      "Los 3 turnos",
    );
    const withInactive = [
      ...SHIFTS,
      shift(4, "2026-12-20T17:30:00Z", { isActive: false }),
    ];
    expect(formatShiftList([1, 2, 3], withInactive, { all: true })).toBe(
      "Los 3 turnos",
    );
    expect(formatShiftList([1, 2, 3], SHIFTS)).toBe(
      "Vie 18 15:00 · Sáb 19 10:00 · Sáb 19 13:30",
    );
  });

  it("skips unknown ids and is null with nothing left", () => {
    expect(formatShiftList([99], SHIFTS)).toBeNull();
    expect(formatShiftList([], SHIFTS, { all: true })).toBeNull();
  });
});

describe("labels", () => {
  it("names a gone shift by its id", () => {
    expect(shiftFilterLabel(SHIFTS, 1, true)).toBe(
      "Vie 18 dic · 15:00–19:00 (Turno 1)",
    );
    expect(shiftFilterLabel(SHIFTS, 77)).toBe("Turno #77");
  });

  it("joins the age and the phone", () => {
    const today = new Date("2026-11-21T16:00:00Z");
    expect(
      volunteerAgeAndPhone(
        { birthdate: "2004-11-22", phone: "+591 70000001" },
        today,
      ),
    ).toBe("21 años · +591 70000001");
    expect(
      volunteerAgeAndPhone({ birthdate: "not-a-date", phone: "+591 7" }, today),
    ).toBe("+591 7");
  });
});
