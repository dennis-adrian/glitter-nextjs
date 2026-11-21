// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  ageOn,
  canAssignVolunteer,
  daysOverShiftLimit,
  decideShiftAssignment,
  defaultAssignedRoleId,
  POSTGRES_INT_MAX,
  shiftCoverageState,
  VOLUNTEER_ADMIN_COPY,
  VOLUNTEER_ASSIGN_AUTO_ACCEPTS,
  VOLUNTEER_APPLICATION_STATUSES,
  VOLUNTEER_STATUS_FILTER_LABELS,
  VOLUNTEER_STATUS_FILTERS,
  VOLUNTEER_STATUS_LABELS,
  VolunteerApplicationsSearchSchema,
  volunteerAdminPath,
  volunteerApplicationAdminPath,
  volunteerSetupAdminPath,
  volunteerShiftAdminPath,
  whatsappHref,
} from "@/app/lib/volunteers/admin-definitions";

/** An instant from La Paz wall-clock time (UTC-4, no DST). */
function laPaz(isoLocal: string) {
  return { startsAt: new Date(`${isoLocal}-04:00`) };
}

describe("paths", () => {
  it("nests the application and the setup under the festival", () => {
    expect(volunteerAdminPath(7)).toBe("/dashboard/festivals/7/volunteers");
    expect(volunteerApplicationAdminPath(7, 42)).toBe(
      "/dashboard/festivals/7/volunteers/42",
    );
    expect(volunteerSetupAdminPath(7)).toBe(
      "/dashboard/festivals/7/volunteers/setup",
    );
    expect(volunteerShiftAdminPath(7, 12)).toBe(
      "/dashboard/festivals/7/volunteers/shifts/12",
    );
  });
});

describe("decideShiftAssignment", () => {
  it("assigns an accepted application without changing its status", () => {
    expect(decideShiftAssignment("accepted", true)).toEqual({
      kind: "assign",
      accept: false,
    });
    expect(decideShiftAssignment("accepted", false)).toEqual({
      kind: "assign",
      accept: false,
    });
  });

  it("accepts a pending or waitlisted one while the switch is on", () => {
    expect(VOLUNTEER_ASSIGN_AUTO_ACCEPTS).toBe(true);
    for (const status of ["pending", "waitlist"] as const) {
      expect(decideShiftAssignment(status)).toEqual({
        kind: "assign",
        accept: true,
      });
      expect(decideShiftAssignment(status, false)).toEqual({
        kind: "refuse",
        message: VOLUNTEER_ADMIN_COPY.assignmentLocked,
      });
    }
  });

  it("always refuses a rejected one", () => {
    for (const autoAccept of [true, false]) {
      expect(decideShiftAssignment("rejected", autoAccept)).toEqual({
        kind: "refuse",
        message: "No se puede asignar una postulación no aceptada.",
      });
    }
  });
});

describe("defaultAssignedRoleId", () => {
  const choices = { firstChoiceRoleId: 1, secondChoiceRoleId: 2 };
  it("takes the 1st choice, else the 2nd, while active", () => {
    expect(defaultAssignedRoleId(choices, new Set([1, 2]))).toBe(1);
    expect(defaultAssignedRoleId(choices, new Set([2, 3]))).toBe(2);
    expect(defaultAssignedRoleId(choices, new Set([3]))).toBeNull();
  });
});

describe("status labels", () => {
  it("name every status as the mockups do", () => {
    expect(VOLUNTEER_STATUS_LABELS).toEqual({
      pending: "Pendiente",
      accepted: "Aceptada",
      waitlist: "En espera",
      rejected: "No aceptada",
    });
  });

  it("offer every status plus all as a filter, all first", () => {
    expect(VOLUNTEER_STATUS_FILTERS).toEqual([
      "all",
      ...VOLUNTEER_APPLICATION_STATUSES,
    ]);
    expect(
      VOLUNTEER_STATUS_FILTERS.map(
        (filter) => VOLUNTEER_STATUS_FILTER_LABELS[filter],
      ),
    ).toEqual([
      "Todas",
      "Pendientes",
      "Aceptadas",
      "En espera",
      "No aceptadas",
    ]);
  });
});

describe("canAssignVolunteer", () => {
  it("unlocks only for an accepted application", () => {
    expect(
      VOLUNTEER_APPLICATION_STATUSES.filter((status) =>
        canAssignVolunteer(status),
      ),
    ).toEqual(["accepted"]);
  });
});

describe("daysOverShiftLimit", () => {
  it("is empty within two shifts a day", () => {
    expect(
      daysOverShiftLimit([
        laPaz("2026-12-19T09:00"),
        laPaz("2026-12-19T15:00"),
        laPaz("2026-12-20T09:00"),
        laPaz("2026-12-20T15:00"),
      ]),
    ).toEqual([]);
    expect(daysOverShiftLimit([])).toEqual([]);
  });

  it("names every La Paz day over the limit, sorted", () => {
    expect(
      daysOverShiftLimit([
        laPaz("2026-12-20T09:00"),
        laPaz("2026-12-20T13:00"),
        laPaz("2026-12-20T17:00"),
        laPaz("2026-12-19T09:00"),
        laPaz("2026-12-19T13:00"),
        laPaz("2026-12-19T17:00"),
        laPaz("2026-12-21T09:00"),
      ]),
    ).toEqual(["2026-12-19", "2026-12-20"]);
  });

  it("counts a late shift on its La Paz day, not its UTC day", () => {
    // 22:00 on the 19th in La Paz is already the 20th in UTC.
    const lateOn19th = laPaz("2026-12-19T22:00");
    expect(lateOn19th.startsAt.toISOString()).toBe("2026-12-20T02:00:00.000Z");

    expect(
      daysOverShiftLimit([
        laPaz("2026-12-19T09:00"),
        laPaz("2026-12-19T15:00"),
        lateOn19th,
      ]),
    ).toEqual(["2026-12-19"]);
    // Two on the 20th (UTC) plus the late one: still two per La Paz day.
    expect(
      daysOverShiftLimit([
        lateOn19th,
        laPaz("2026-12-20T09:00"),
        laPaz("2026-12-20T15:00"),
      ]),
    ).toEqual([]);
  });

  it("honours another maximum", () => {
    expect(
      daysOverShiftLimit(
        [laPaz("2026-12-19T09:00"), laPaz("2026-12-19T15:00")],
        1,
      ),
    ).toEqual(["2026-12-19"]);
  });
});

describe("ageOn", () => {
  it("counts whole years on La Paz's calendar", () => {
    const today = new Date("2026-11-21T14:00:00.000Z");
    expect(ageOn("2004-11-21", today)).toBe(22);
    expect(ageOn("2004-11-22", today)).toBe(21);
    expect(ageOn("2004-11-20", today)).toBe(22);
  });

  it("uses La Paz's day, not UTC's, late in the evening", () => {
    // 21:30 on the 21st in La Paz is already the 22nd in UTC.
    const lateOn21st = new Date("2026-11-22T01:30:00.000Z");
    expect(ageOn("2004-11-22", lateOn21st)).toBe(21);
    expect(ageOn("2004-11-22", new Date("2026-11-22T04:00:00.000Z"))).toBe(22);
  });
});

describe("shiftCoverageState", () => {
  it("is unset while the cupo is 0", () => {
    expect(
      shiftCoverageState({
        neededHeadcount: 0,
        assignedCount: 2,
        availableCount: 5,
      }),
    ).toEqual({ kind: "unset", label: "Sin cupo" });
  });

  it("is complete once the cupo is assigned, or more", () => {
    for (const assignedCount of [4, 5]) {
      expect(
        shiftCoverageState({
          neededHeadcount: 4,
          assignedCount,
          availableCount: 6,
        }),
      ).toEqual({ kind: "complete", label: "Completo" });
    }
  });

  it("is missing while enough unassigned people marked it", () => {
    expect(
      shiftCoverageState({
        neededHeadcount: 6,
        assignedCount: 2,
        availableCount: 6,
      }),
    ).toEqual({ kind: "missing", missing: 4, label: "Faltan 4" });
  });

  it("is short when those who marked it cannot fill it", () => {
    expect(
      shiftCoverageState({
        neededHeadcount: 6,
        assignedCount: 2,
        availableCount: 5,
      }),
    ).toEqual({
      kind: "short",
      missing: 4,
      label: "Faltan 4, solo 5 disponibles",
    });
    expect(
      shiftCoverageState({
        neededHeadcount: 3,
        assignedCount: 0,
        availableCount: 0,
      }),
    ).toMatchObject({ kind: "short", label: "Faltan 3, solo 0 disponibles" });
  });
});

describe("whatsappHref", () => {
  it("keeps only the digits", () => {
    expect(whatsappHref("+591 7123-4567")).toBe("https://wa.me/59171234567");
    expect(whatsappHref("(591) 71.23.45.67")).toBe("https://wa.me/59171234567");
  });

  it("is null without digits", () => {
    expect(whatsappHref("")).toBeNull();
    expect(whatsappHref("sin teléfono")).toBeNull();
  });
});

describe("VolunteerApplicationsSearchSchema", () => {
  it("defaults to all, no search and the first page of 25", () => {
    expect(VolunteerApplicationsSearchSchema.parse({})).toEqual({
      status: "all",
      query: "",
      roleId: undefined,
      shiftId: undefined,
      limit: 25,
      offset: 0,
    });
  });

  it("reads valid params from the URL", () => {
    expect(
      VolunteerApplicationsSearchSchema.parse({
        status: "waitlist",
        query: "  camila ",
        roleId: "3",
        shiftId: "8",
        limit: "50",
        offset: "50",
      }),
    ).toEqual({
      status: "waitlist",
      query: "camila",
      roleId: 3,
      shiftId: 8,
      limit: 50,
      offset: 50,
    });
  });

  it("falls back to the default for a bad param instead of failing", () => {
    expect(
      VolunteerApplicationsSearchSchema.parse({
        status: "approved",
        query: ["a", "b"],
        roleId: "abc",
        shiftId: "-2",
        limit: "30",
        offset: "-10",
      }),
    ).toEqual({
      status: "all",
      query: "",
      roleId: undefined,
      shiftId: undefined,
      limit: 25,
      offset: 0,
    });
    expect(
      VolunteerApplicationsSearchSchema.parse({ roleId: "1.5" }).roleId,
    ).toBeUndefined();
  });

  it("cuts an over-long search to 200 characters instead of dropping it", () => {
    const query = VolunteerApplicationsSearchSchema.parse({
      query: `  ${"x".repeat(150)}${"y".repeat(100)}  `,
    }).query;
    expect(query).toBe(`${"x".repeat(150)}${"y".repeat(50)}`);
  });

  it("drops an id Postgres's int4 cannot hold", () => {
    const parsed = VolunteerApplicationsSearchSchema.parse({
      roleId: `${POSTGRES_INT_MAX + 1}`,
      shiftId: "99999999999",
    });
    expect(parsed.roleId).toBeUndefined();
    expect(parsed.shiftId).toBeUndefined();
    expect(
      VolunteerApplicationsSearchSchema.parse({
        roleId: `${POSTGRES_INT_MAX}`,
      }).roleId,
    ).toBe(POSTGRES_INT_MAX);
  });
});
