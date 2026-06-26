import { describe, expect, it } from "vitest";

import type { FestivalWithDates } from "./definitions";
import { resolveStoreClosure } from "./store-gate";

// resolveStoreClosure only reads `keepStoreOpen` and the festival dates, so a
// minimal fixture is enough.
function makeFestival(
  overrides: {
    keepStoreOpen?: boolean;
    startDate?: Date;
    endDate?: Date;
  } = {},
): FestivalWithDates {
  const startDate = overrides.startDate ?? new Date("2026-06-26T00:00:00.000Z");
  const endDate = overrides.endDate ?? new Date("2026-06-26T23:59:59.000Z");

  return {
    id: 1,
    name: "Glitter Fest",
    keepStoreOpen: overrides.keepStoreOpen ?? false,
    festivalDates: [{ startDate, endDate }],
  } as unknown as FestivalWithDates;
}

// Noon UTC on the festival day (08:00 in America/La_Paz) is comfortably inside
// the full-day span.
const duringFestival = new Date("2026-06-26T12:00:00.000Z");

describe("resolveStoreClosure", () => {
  it("forces closed with the custom copy when mode is 'closed'", () => {
    const result = resolveStoreClosure({
      mode: "closed",
      closedTitle: "Cerrado",
      closedMessage: "Volvemos pronto",
      festival: null,
      now: duringFestival,
    });

    expect(result).toEqual({
      closed: true,
      source: "manual",
      title: "Cerrado",
      message: "Volvemos pronto",
    });
  });

  it("forces open when mode is 'open', even during a festival", () => {
    const result = resolveStoreClosure({
      mode: "open",
      closedTitle: null,
      closedMessage: null,
      festival: makeFestival(),
      now: duringFestival,
    });

    expect(result).toEqual({ closed: false });
  });

  it("auto: closes for the festival when one is happening", () => {
    const festival = makeFestival();
    const result = resolveStoreClosure({
      mode: "auto",
      closedTitle: null,
      closedMessage: null,
      festival,
      now: duringFestival,
    });

    expect(result).toEqual({ closed: true, source: "festival", festival });
  });

  it("auto: stays open during a festival when keepStoreOpen is set", () => {
    const result = resolveStoreClosure({
      mode: "auto",
      closedTitle: null,
      closedMessage: null,
      festival: makeFestival({ keepStoreOpen: true }),
      now: duringFestival,
    });

    expect(result).toEqual({ closed: false });
  });

  it("auto: stays open when there is no active festival", () => {
    const result = resolveStoreClosure({
      mode: "auto",
      closedTitle: null,
      closedMessage: null,
      festival: null,
      now: duringFestival,
    });

    expect(result).toEqual({ closed: false });
  });

  it("auto: stays open when the festival is not currently happening", () => {
    const result = resolveStoreClosure({
      mode: "auto",
      closedTitle: null,
      closedMessage: null,
      festival: makeFestival({
        startDate: new Date("2020-01-01T00:00:00.000Z"),
        endDate: new Date("2020-01-02T23:59:59.000Z"),
      }),
      now: duringFestival,
    });

    expect(result).toEqual({ closed: false });
  });
});
