// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  formatCloseDate,
  formatFestivalDateTile,
  formatShiftWhenShort,
  formatFestivalDays,
  formatInduction,
  formatShiftSummary,
} from "@/app/lib/volunteers/format";

describe("volunteer formatting", () => {
  it("shows a shift on La Paz's clock", () => {
    expect(
      formatShiftSummary({
        id: 1,
        label: "Montaje",
        startsAt: new Date("2026-12-18T19:00:00Z"),
        endsAt: new Date("2026-12-18T23:00:00Z"),
      }),
    ).toBe("Vie 18 dic · 15:00–19:00 — Montaje");
  });

  it("shows the induction's day without an hour until one is set", () => {
    expect(formatInduction({ date: "2026-12-05", time: null })).toBe(
      "sábado 5 de diciembre",
    );
    expect(formatInduction({ date: "2026-12-05", time: "18:00:00" })).toBe(
      "sábado 5 de diciembre, 18:00",
    );
  });

  it("names the closing date and the festival's date tile", () => {
    expect(formatCloseDate(new Date("2026-12-01T03:59:00Z"))).toEqual({
      weekdayDate: "lunes 30 de noviembre",
      time: "23:59",
      date: "30 de noviembre",
    });
    expect(
      formatFestivalDateTile([
        new Date("2026-12-19T14:00:00Z"),
        new Date("2026-12-20T14:00:00Z"),
      ]),
    ).toEqual({ days: "19–20", monthYear: "dic 2026" });
    expect(
      formatShiftWhenShort({
        startsAt: new Date("2026-12-18T19:00:00Z"),
        endsAt: new Date("2026-12-18T23:00:00Z"),
      }),
    ).toBe("Vie 18 · 15:00–19:00");
  });

  it("names the festival's days", () => {
    expect(
      formatFestivalDays([
        new Date("2026-12-19T14:00:00Z"),
        new Date("2026-12-20T14:00:00Z"),
      ]),
    ).toBe("19 y 20 de diciembre de 2026");
    expect(formatFestivalDays([])).toBeNull();
  });
});
