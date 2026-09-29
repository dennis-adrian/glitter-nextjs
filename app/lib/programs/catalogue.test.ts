import { describe, expect, it } from "vitest";

import {
  buildCatalogue,
  isOccurrenceUpcoming,
  nextUpcomingOccurrence,
  resolveProgramsNavTarget,
} from "@/app/lib/programs/catalogue";
import {
  programPath,
  sessionAdminPath,
  sessionPath,
} from "@/app/lib/programs/paths";

const NOW = new Date("2026-10-01T15:00:00.000Z");
const HOUR_MS = 60 * 60 * 1000;

function hoursFromNow(hours: number): Date {
  return new Date(NOW.getTime() + hours * HOUR_MS);
}

function occurrence(
  startHours: number,
  endHours: number,
  lifecycleStatus: "scheduled" | "cancelled" | "completed" = "scheduled",
) {
  return {
    startsAt: hoursFromNow(startHours),
    endsAt: hoursFromNow(endHours),
    lifecycleStatus,
  };
}

describe("isOccurrenceUpcoming", () => {
  it("counts a future and a running occurrence, not one that is over", () => {
    expect(isOccurrenceUpcoming(occurrence(2, 4), NOW)).toBe(true);
    expect(isOccurrenceUpcoming(occurrence(-1, 1), NOW)).toBe(true);
    expect(isOccurrenceUpcoming(occurrence(-3, -1), NOW)).toBe(false);
  });

  it("stops at the end itself, matching when sales stop", () => {
    expect(isOccurrenceUpcoming(occurrence(-2, 0), NOW)).toBe(false);
  });

  it("ignores cancelled and completed occurrences", () => {
    expect(isOccurrenceUpcoming(occurrence(2, 4, "cancelled"), NOW)).toBe(
      false,
    );
    expect(isOccurrenceUpcoming(occurrence(-1, 1, "completed"), NOW)).toBe(
      false,
    );
  });
});

describe("nextUpcomingOccurrence", () => {
  it("picks the soonest upcoming one whatever the input order", () => {
    const later = occurrence(48, 50);
    const running = occurrence(-1, 1);
    const over = occurrence(-10, -8);

    expect(nextUpcomingOccurrence([later, over, running], NOW)).toBe(running);
  });

  it("returns null when everything is over or cancelled", () => {
    expect(
      nextUpcomingOccurrence(
        [occurrence(-10, -8), occurrence(5, 6, "cancelled")],
        NOW,
      ),
    ).toBeNull();
  });
});

describe("resolveProgramsNavTarget", () => {
  it("hides the entry when nothing is upcoming", () => {
    expect(resolveProgramsNavTarget([])).toBeNull();
  });

  it("goes straight to a single upcoming session, standalone or not", () => {
    expect(
      resolveProgramsNavTarget([
        { path: "/programs/sessions/risografia", programSlug: null },
      ]),
    ).toBe("/programs/sessions/risografia");
    expect(
      resolveProgramsNavTarget([
        { path: "/programs/semana/acuarela", programSlug: "semana" },
      ]),
    ).toBe("/programs/semana/acuarela");
  });

  it("goes to the program when every upcoming session belongs to it", () => {
    expect(
      resolveProgramsNavTarget([
        { path: "/programs/semana/a", programSlug: "semana" },
        { path: "/programs/semana/b", programSlug: "semana" },
      ]),
    ).toBe("/programs/semana");
  });

  it("goes to the catalogue for a mix, or for several standalone sessions", () => {
    expect(
      resolveProgramsNavTarget([
        { path: "/programs/semana/a", programSlug: "semana" },
        { path: "/programs/sessions/b", programSlug: null },
      ]),
    ).toBe("/programs");
    expect(
      resolveProgramsNavTarget([
        { path: "/programs/sessions/a", programSlug: null },
        { path: "/programs/sessions/b", programSlug: null },
      ]),
    ).toBe("/programs");
  });
});

describe("buildCatalogue", () => {
  it("lists upcoming sessions soonest first and splits programs by whether anything is ahead", () => {
    const semana = { id: 1, endDate: null };
    const fanzines = { id: 2, endDate: null };
    const sessions = [
      { id: 10, programId: 1, occurrences: [occurrence(-30, -28)] },
      { id: 11, programId: 2, occurrences: [occurrence(72, 74)] },
      { id: 12, programId: null, occurrences: [occurrence(-1, 1)] },
      { id: 13, programId: null, occurrences: [occurrence(-5, -4)] },
    ];

    const catalogue = buildCatalogue({
      sessions,
      programs: [semana, fanzines],
      now: NOW,
    });

    expect(catalogue.upcomingSessions.map((entry) => entry.session.id)).toEqual(
      [12, 11],
    );
    expect(catalogue.currentPrograms).toEqual([fanzines]);
    expect(catalogue.pastPrograms).toEqual([semana]);
  });
});

describe("buildCatalogue for programs with nothing listed yet", () => {
  it("keeps an announced program current until it has actually happened", () => {
    const announced = { id: 3, endDate: hoursFromNow(24 * 60) };
    const undated = { id: 4, endDate: null };
    const lapsed = { id: 5, endDate: hoursFromNow(-24 * 3) };

    const catalogue = buildCatalogue({
      sessions: [
        // A cancelled occurrence is not a session that happened.
        {
          id: 20,
          programId: 4,
          occurrences: [occurrence(-5, -4, "cancelled")],
        },
      ],
      programs: [announced, undated, lapsed],
      now: NOW,
    });

    expect(catalogue.currentPrograms).toEqual([announced, undated]);
    expect(catalogue.pastPrograms).toEqual([lapsed]);
  });
});

describe("paths", () => {
  it("builds program, session, and admin URLs for both kinds of session", () => {
    expect(programPath("semana")).toBe("/programs/semana");
    expect(sessionPath({ slug: "a", program: { slug: "semana" } })).toBe(
      "/programs/semana/a",
    );
    expect(sessionPath({ slug: "a", program: null })).toBe(
      "/programs/sessions/a",
    );
    expect(sessionAdminPath({ id: 7, programId: 3 })).toBe(
      "/dashboard/programs/3/sessions/7",
    );
    expect(sessionAdminPath({ id: 7, programId: null })).toBe(
      "/dashboard/programs/sessions/7",
    );
  });
});
