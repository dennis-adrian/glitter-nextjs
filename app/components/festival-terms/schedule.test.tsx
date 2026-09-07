import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import FestivalTermsSchedule from "@/app/components/festival-terms/schedule";
import type { FestivalDate } from "@/app/lib/festivals/definitions";

afterEach(cleanup);

const STRUCTURES_COPY =
  "Los expositores tienen permitido dejar sus estructuras armadas para facilitar acomodarse el segundo día del festival.";

const DEPARTURE_COPY =
  "El horario en que los expositores tienen permitido retirarse este día";

const GENERIC_ENTRY_COPY =
  "El ingreso de los expositores será desde las";

const ILLUSTRATION_ENTRY_COPY =
  "Los expositores de la categoría";

function festivalDate(
  id: number,
  start: string,
  end: string,
): FestivalDate {
  return {
    id,
    festivalId: 1,
    startDate: new Date(start),
    endDate: new Date(end),
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

describe("FestivalTermsSchedule day-one teardown", () => {
  it("omits the structures sentence for single-day festivals but keeps the departure window", () => {
    render(
      <FestivalTermsSchedule
        category="illustration"
        festival={{
          festivalType: "glitter",
          festivalDates: [
            festivalDate(
              1,
              "2026-08-15T14:00:00.000Z",
              "2026-08-15T22:00:00.000Z",
            ),
          ],
        }}
      />,
    );

    expect(screen.queryByText(STRUCTURES_COPY)).toBeNull();
    expect(screen.getByText(new RegExp(DEPARTURE_COPY))).toBeTruthy();
  });

  it("shows the structures sentence when a second festival day exists", () => {
    render(
      <FestivalTermsSchedule
        category="illustration"
        festival={{
          festivalType: "glitter",
          festivalDates: [
            festivalDate(
              1,
              "2026-08-15T14:00:00.000Z",
              "2026-08-15T22:00:00.000Z",
            ),
            festivalDate(
              2,
              "2026-08-16T14:00:00.000Z",
              "2026-08-16T22:00:00.000Z",
            ),
          ],
        }}
      />,
    );

    expect(screen.getByText(STRUCTURES_COPY)).toBeTruthy();
    expect(screen.getByText(new RegExp(DEPARTURE_COPY))).toBeTruthy();
  });
});

describe("FestivalTermsSchedule entry hours by category", () => {
  const festival = {
    festivalType: "glitter" as const,
    festivalDates: [
      festivalDate(
        1,
        "2026-08-15T14:00:00.000Z",
        "2026-08-15T22:00:00.000Z",
      ),
    ],
  };

  it("keeps dedicated illustration copy and omits the generic paragraph", () => {
    render(
      <FestivalTermsSchedule category="illustration" festival={festival} />,
    );

    expect(screen.getByText(new RegExp(ILLUSTRATION_ENTRY_COPY))).toBeTruthy();
    expect(screen.queryByText(new RegExp(GENERIC_ENTRY_COPY))).toBeNull();
    expect(screen.queryByText("Galería:")).toBeNull();
  });

  it("renders generic entry hours for new_artist instead of illustration copy", () => {
    render(
      <FestivalTermsSchedule category="new_artist" festival={festival} />,
    );

    expect(screen.getByText(new RegExp(GENERIC_ENTRY_COPY))).toBeTruthy();
    expect(screen.queryByText(new RegExp(ILLUSTRATION_ENTRY_COPY))).toBeNull();
    expect(screen.queryByText("Galería:")).toBeNull();
  });
});
