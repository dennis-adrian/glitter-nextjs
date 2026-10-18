import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";

import { formatDisplayDate } from "@/app/lib/formatters";
import {
  countOtherUpcomingOccurrences,
  countUpcomingByProgram,
  formatDateRange,
  pickSessionArtwork,
  resolveSessionContext,
} from "@/app/lib/programs/catalogue-view";

const NOW = new Date("2026-10-01T15:00:00.000Z");
const HOUR_MS = 60 * 60 * 1000;

function occurrence(
  startHours: number,
  endHours: number,
  lifecycleStatus: "scheduled" | "cancelled" | "completed" = "scheduled",
) {
  return {
    startsAt: new Date(NOW.getTime() + startHours * HOUR_MS),
    endsAt: new Date(NOW.getTime() + endHours * HOUR_MS),
    lifecycleStatus,
  };
}

describe("resolveSessionContext", () => {
  it("names and links the program of a program session", () => {
    expect(
      resolveSessionContext({
        program: { slug: "semana", name: "Semana de la Ilustración" },
        festival: null,
      }),
    ).toEqual({
      kind: "program",
      label: "Semana de la Ilustración",
      href: "/programs/semana",
    });
  });

  it("names and links the festival of a standalone session once it is public", () => {
    for (const status of ["published", "active", "archived"]) {
      expect(
        resolveSessionContext({
          program: null,
          festival: { id: 12, name: "Glitter 12", status },
        }),
      ).toEqual({
        kind: "festival",
        label: "Parte de Glitter 12",
        href: "/festivals/12",
      });
    }
  });

  it("says nothing about a festival that is still a draft", () => {
    // No page to link to, and naming it would announce it early.
    expect(
      resolveSessionContext({
        program: null,
        festival: { id: 12, name: "Glitter 12", status: "draft" },
      }),
    ).toBeNull();
  });

  it("says nothing for a standalone session with no festival", () => {
    expect(resolveSessionContext({ program: null, festival: null })).toBeNull();
  });
});

describe("countUpcomingByProgram", () => {
  it("counts per program and skips standalone sessions", () => {
    const counts = countUpcomingByProgram([
      { session: { programId: 1 } },
      { session: { programId: null } },
      { session: { programId: 1 } },
      { session: { programId: 2 } },
    ]);

    expect(counts.get(1)).toBe(2);
    expect(counts.get(2)).toBe(1);
    expect(counts.size).toBe(2);
  });
});

describe("countOtherUpcomingOccurrences", () => {
  it("counts upcoming dates beyond the one shown", () => {
    expect(
      countOtherUpcomingOccurrences(
        [occurrence(2, 4), occurrence(26, 28), occurrence(50, 52)],
        NOW,
      ),
    ).toBe(2);
  });

  it("ignores ended and cancelled dates, and never goes negative", () => {
    expect(
      countOtherUpcomingOccurrences(
        [occurrence(-5, -4), occurrence(2, 4), occurrence(6, 8, "cancelled")],
        NOW,
      ),
    ).toBe(0);
    expect(countOtherUpcomingOccurrences([occurrence(-5, -4)], NOW)).toBe(0);
  });
});

describe("pickSessionArtwork", () => {
  const speaker = (imageUrl: string | null, publicName = "Ana") => ({
    speaker: { publicName, imageUrl },
  });

  it("prefers the session's own image", () => {
    expect(
      pickSessionArtwork({
        imageUrl: "https://utfs.io/f/session.png",
        sessionSpeakers: [speaker("https://utfs.io/f/ana.png")],
      }),
    ).toEqual({
      src: "https://utfs.io/f/session.png",
      alt: "",
      kind: "session",
    });
  });

  it("falls back to the first allowed speaker portrait", () => {
    expect(
      pickSessionArtwork({
        imageUrl: null,
        sessionSpeakers: [
          speaker("https://example.com/leo.png", "Leo"),
          speaker("https://utfs.io/f/ana.png", "Ana"),
        ],
      }),
    ).toEqual({
      src: "https://utfs.io/f/ana.png",
      alt: "Ana",
      kind: "speaker",
    });
  });

  it("rejects a disallowed session image and returns null with nothing usable", () => {
    expect(
      pickSessionArtwork({
        imageUrl: "https://example.com/session.png",
        sessionSpeakers: [speaker(null)],
      }),
    ).toBeNull();
  });
});

describe("formatDateRange", () => {
  const start = new Date("2026-10-05T14:00:00.000Z");
  const end = new Date("2026-10-09T22:00:00.000Z");

  it("joins both ends", () => {
    expect(formatDateRange(start, end)).toBe(
      `${formatDisplayDate(start, DateTime.DATE_MED)} al ${formatDisplayDate(end, DateTime.DATE_MED)}`,
    );
  });

  it("shows one date when both ends fall on the same day, or when one is missing", () => {
    const sameDayEnd = new Date("2026-10-05T20:00:00.000Z");
    const single = formatDisplayDate(start, DateTime.DATE_MED);

    expect(formatDateRange(start, sameDayEnd)).toBe(single);
    expect(formatDateRange(start, null)).toBe(single);
  });

  it("returns null for an undated program", () => {
    expect(formatDateRange(null, null)).toBeNull();
  });
});
