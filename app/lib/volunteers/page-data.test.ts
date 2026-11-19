// @vitest-environment node

import { describe, expect, it } from "vitest";

import type { VolunteerCall } from "@/app/lib/volunteers/definitions";
import { volunteerPageView } from "@/app/lib/volunteers/page-data";

const call: VolunteerCall = {
  festival: {
    id: 1,
    name: "Glitter v11",
    locationLabel: "Teatro CBA",
    address: "Santa Cruz de la Sierra",
    days: [new Date("2026-12-19T14:00:00Z"), new Date("2026-12-20T14:00:00Z")],
  },
  applicationsCloseAt: new Date("2026-12-01T03:59:00Z"),
  induction: { date: "2026-12-05", time: null },
  roles: [
    { id: 1, name: "Orientación al público", description: "" },
    { id: 2, name: "Montaje y desmontaje", description: "" },
  ],
  shifts: [
    {
      id: 1,
      label: "Festival (turno A)",
      startsAt: new Date("2026-12-19T17:30:00Z"),
      endsAt: new Date("2026-12-19T21:30:00Z"),
    },
    {
      id: 2,
      label: "Montaje",
      startsAt: new Date("2026-12-18T19:00:00Z"),
      endsAt: new Date("2026-12-18T23:00:00Z"),
    },
  ],
  ageCutoffDate: "2026-12-18",
};

describe("volunteerPageView", () => {
  it("says what the pages show while the call is open", () => {
    expect(volunteerPageView(call, new Date("2026-11-20T12:00:00Z"))).toEqual({
      open: true,
      closesShort: "lunes 30 de noviembre, 23:59",
      closesLong: "lunes 30 de noviembre a las 23:59",
      closesOn: "30 de noviembre",
      dateTile: { days: "19–20", monthYear: "dic 2026" },
      venue: "Teatro CBA, Santa Cruz de la Sierra",
      setupDay: "viernes 18 de diciembre",
      ageCutoff: "18 de diciembre de 2026",
      induction: "sábado 5 de diciembre",
    });
  });

  it("closes after the closing instant", () => {
    expect(volunteerPageView(call, new Date("2026-12-01T04:00:00Z")).open).toBe(
      false,
    );
  });

  it("stays closed without two roles to choose from", () => {
    expect(
      volunteerPageView(
        { ...call, roles: call.roles.slice(0, 1) },
        new Date("2026-11-20T12:00:00Z"),
      ).open,
    ).toBe(false);
  });
});
