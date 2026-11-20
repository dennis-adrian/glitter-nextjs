// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  canAssignVolunteer,
  daysOverShiftLimit,
  POSTGRES_INT_MAX,
  VOLUNTEER_APPLICATION_STATUSES,
  VolunteerApplicationsSearchSchema,
  volunteerAdminPath,
  volunteerApplicationAdminPath,
  volunteerSetupAdminPath,
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
  it("defaults to pending, no search and the first page of 25", () => {
    expect(VolunteerApplicationsSearchSchema.parse({})).toEqual({
      status: "pending",
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
        status: "all",
        query: "  camila ",
        roleId: "3",
        shiftId: "8",
        limit: "50",
        offset: "50",
      }),
    ).toEqual({
      status: "all",
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
      status: "pending",
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
