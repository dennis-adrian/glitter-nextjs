import { describe, expect, it } from "vitest";

import {
  formatDaysLeft,
  formatFestivalDays,
  participationSentence,
} from "@/app/lib/home/festival";

// Noon in La Paz, so the day never shifts with the zone.
const day = (iso: string) => ({ startDate: new Date(`${iso}T16:00:00Z`) });

describe("formatFestivalDays", () => {
  it("joins two days of one month with «y»", () => {
    expect(formatFestivalDays([day("2026-11-15"), day("2026-11-14")])).toBe(
      "14 y 15 de noviembre",
    );
  });

  it("uses «al» for a longer run and names both months across a month", () => {
    expect(
      formatFestivalDays([day("2026-11-14"), day("2026-11-15"), day("2026-11-16")]),
    ).toBe("14 al 16 de noviembre");
    expect(formatFestivalDays([day("2026-10-31"), day("2026-11-01")])).toBe(
      "31 de octubre y 1 de noviembre",
    );
  });

  it("says a single day plainly, and nothing without dates", () => {
    expect(formatFestivalDays([day("2026-11-14")])).toBe("14 de noviembre");
    expect(formatFestivalDays([])).toBe("");
  });
});

describe("formatDaysLeft", () => {
  it("counts down, singular at one, and is silent once started", () => {
    expect(formatDaysLeft(21)).toBe("faltan 21 días");
    expect(formatDaysLeft(1)).toBe("falta 1 día");
    expect(formatDaysLeft(null)).toBeNull();
  });
});

describe("participationSentence", () => {
  const base = {
    reservationsStartDate: new Date("2026-10-20T16:00:00Z"),
    standLabel: "stand B12",
    categoryName: "Ilustración",
    partners: [] as string[],
  };

  it("names the stand, the category and who shares it once confirmed", () => {
    expect(
      participationSentence({
        ...base,
        status: "confirmed_reservation",
        partners: ["Juan Pérez"],
      }),
    ).toBe("Stand B12 · Ilustración · compartido con Juan Pérez");
  });

  it("says what is missing before that", () => {
    expect(participationSentence({ ...base, status: "pending_payment" })).toBe(
      "Falta pagar tu stand B12",
    );
    expect(
      participationSentence({ ...base, status: "waiting_for_reservations" }),
    ).toBe("Las reservas abren el 20 de octubre");
    expect(participationSentence({ ...base, status: "no_stands_available" })).toBe(
      "Los espacios de Ilustración se agotaron",
    );
  });
});
