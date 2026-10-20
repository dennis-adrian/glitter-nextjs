// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: {} }));

import type { FestivalWithDates } from "@/app/lib/festivals/definitions";
import {
  bookableFestivalDate,
  DOOR_REGISTRATION_NOT_TODAY_MESSAGE,
  DOOR_REGISTRATION_OFF_MESSAGE,
  festivalDateOn,
  REGISTRATION_CLOSED_MESSAGE,
  registrationBlocker,
} from "@/app/lib/visitors/registration-data";

// Saturday and Sunday, 10:00 in La Paz (UTC-4).
const SATURDAY = new Date("2026-10-24T14:00:00Z");
const SUNDAY = new Date("2026-10-25T14:00:00Z");

function festival(
  overrides: Partial<FestivalWithDates> = {},
): FestivalWithDates {
  return {
    id: 1,
    status: "active",
    publicRegistration: true,
    eventDayRegistration: true,
    festivalDates: [SATURDAY, SUNDAY].map((startDate, index) => ({
      id: index + 1,
      festivalId: 1,
      startDate,
      endDate: new Date(startDate.getTime() + 8 * 60 * 60 * 1000),
    })),
    ...overrides,
  } as FestivalWithDates;
}

describe("festivalDateOn", () => {
  it("finds the second day, not just the first", () => {
    const now = new Date("2026-10-25T20:00:00Z");
    expect(festivalDateOn(festival(), now)?.startDate).toEqual(SUNDAY);
  });

  it("uses the store's day, not UTC's: 23:30 Saturday in La Paz is still Saturday", () => {
    const now = new Date("2026-10-25T03:30:00Z");
    expect(festivalDateOn(festival(), now)?.startDate).toEqual(SATURDAY);
  });

  it("is null on a day without festival", () => {
    expect(festivalDateOn(festival(), new Date("2026-10-23T14:00:00Z"))).toBeNull();
  });
});

describe("registrationBlocker", () => {
  const saturdayNoon = new Date("2026-10-24T16:00:00Z");

  it("lets both forms through on a festival day with everything on", () => {
    expect(registrationBlocker(festival(), "online", saturdayNoon)).toBeNull();
    expect(registrationBlocker(festival(), "door", saturdayNoon)).toBeNull();
  });

  it("closes both forms when acreditación is closed or the festival inactive", () => {
    for (const closed of [
      festival({ publicRegistration: false }),
      festival({ status: "published" }),
      festival({ status: "archived" }),
    ]) {
      expect(registrationBlocker(closed, "online", saturdayNoon)).toBe(
        REGISTRATION_CLOSED_MESSAGE,
      );
      expect(registrationBlocker(closed, "door", saturdayNoon)).toBe(
        REGISTRATION_CLOSED_MESSAGE,
      );
    }
  });

  it("keeps the door closed when its switch is off, without touching online", () => {
    const off = festival({ eventDayRegistration: false });
    expect(registrationBlocker(off, "door", saturdayNoon)).toBe(
      DOOR_REGISTRATION_OFF_MESSAGE,
    );
    expect(registrationBlocker(off, "online", saturdayNoon)).toBeNull();
  });

  it("opens the door only on festival days", () => {
    const thursday = new Date("2026-10-22T16:00:00Z");
    expect(registrationBlocker(festival(), "door", thursday)).toBe(
      DOOR_REGISTRATION_NOT_TODAY_MESSAGE,
    );
    expect(registrationBlocker(festival(), "online", thursday)).toBeNull();
  });
});

describe("bookableFestivalDate", () => {
  it("accepts one of the festival's days, today or later", () => {
    const thursday = new Date("2026-10-22T16:00:00Z");
    expect(bookableFestivalDate(festival(), SUNDAY, thursday)?.startDate).toEqual(
      SUNDAY,
    );
    const saturdayEvening = new Date("2026-10-25T01:00:00Z");
    expect(
      bookableFestivalDate(festival(), SATURDAY, saturdayEvening)?.startDate,
    ).toEqual(SATURDAY);
  });

  it("refuses a day that already passed", () => {
    const sunday = new Date("2026-10-25T16:00:00Z");
    expect(bookableFestivalDate(festival(), SATURDAY, sunday)).toBeNull();
  });

  it("refuses a date that is not one of the festival's days", () => {
    const thursday = new Date("2026-10-22T16:00:00Z");
    expect(
      bookableFestivalDate(festival(), new Date("2026-10-24T15:00:00Z"), thursday),
    ).toBeNull();
  });
});
