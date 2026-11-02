import { describe, expect, it } from "vitest";

import type { Participation } from "@/app/api/users/definitions";
import { buildHistorySummary } from "@/app/lib/home/history";

let nextId = 1;

function participation({
  festivalId,
  name,
  start,
  stand,
  status = "accepted",
  reservationId = nextId++,
}: {
  festivalId: number;
  name: string;
  start: string;
  stand: string;
  status?: string;
  reservationId?: number;
}): Participation {
  return {
    id: nextId++,
    userId: 1,
    reservationId,
    reservation: {
      id: reservationId,
      festivalId,
      status,
      stand: { label: stand.slice(0, 1), standNumber: Number(stand.slice(1)) },
      members: [],
      festival: {
        id: festivalId,
        name,
        posterUrl: `/poster-${festivalId}.webp`,
        thumbnailUrl: null,
        startDate: null,
        festivalDates: [{ startDate: new Date(start) }],
      },
    },
  } as unknown as Participation;
}

const empty = new Map();

describe("buildHistorySummary", () => {
  it("is null without a past participation", () => {
    expect(
      buildHistorySummary({
        participations: [
          participation({ festivalId: 9, name: "Activo", start: "2026-11-14", stand: "B12" }),
          participation({ festivalId: 3, name: "Cancelada", start: "2026-04-01", stand: "A1", status: "rejected" }),
        ],
        activeFestivalId: 9,
        pastFestivalIds: [3],
        partnersByReservation: empty,
      }),
    ).toBeNull();
  });

  it("leaves out a festival still to come, with or without one in progress", () => {
    // An accepted reservation staff added by hand for an upcoming edition is
    // not history yet: only archived festivals are.
    const upcoming = participation({ festivalId: 7, name: "Próximo", start: "2027-04-10", stand: "A2" });
    const past = participation({ festivalId: 2, name: "Festicker", start: "2026-04-26", stand: "C3" });

    expect(
      buildHistorySummary({
        participations: [upcoming],
        activeFestivalId: null,
        pastFestivalIds: [2],
        partnersByReservation: empty,
      }),
    ).toBeNull();

    const summary = buildHistorySummary({
      participations: [upcoming, past],
      activeFestivalId: null,
      pastFestivalIds: [2],
      partnersByReservation: empty,
    });
    expect(summary?.festivalCount).toBe(1);
    expect(summary?.first.name).toBe("Festicker");
    expect(summary?.stands).toEqual(["C3"]);
  });

  it("counts festivals, not stands, and orders first and last by date", () => {
    const summary = buildHistorySummary({
      participations: [
        participation({ festivalId: 2, name: "Festicker", start: "2026-04-26", stand: "C3" }),
        participation({ festivalId: 1, name: "Twinkler", start: "2025-11-15", stand: "D1" }),
        participation({ festivalId: 2, name: "Festicker", start: "2026-04-26", stand: "C4" }),
      ],
      pastFestivalIds: [2, 1],
      partnersByReservation: empty,
    });

    expect(summary?.festivalCount).toBe(2);
    expect(summary?.first.name).toBe("Twinkler");
    expect(summary?.last?.name).toBe("Festicker");
    expect(summary?.stands).toEqual(["C3", "D1", "C4"]);
  });

  it("shows one festival once", () => {
    const summary = buildHistorySummary({
      participations: [
        participation({ festivalId: 1, name: "Glitter", start: "2025-08-15", stand: "D1" }),
      ],
      pastFestivalIds: [1],
      partnersByReservation: empty,
    });

    expect(summary?.first.name).toBe("Glitter");
    expect(summary?.last).toBeNull();
    expect(summary?.streak).toBeNull();
  });

  it("counts the streak back from the latest edition until one is missing", () => {
    const summary = buildHistorySummary({
      participations: [
        participation({ festivalId: 5, name: "E", start: "2026-08-01", stand: "A1" }),
        participation({ festivalId: 4, name: "D", start: "2026-04-01", stand: "A1" }),
        participation({ festivalId: 2, name: "B", start: "2025-08-01", stand: "A1" }),
      ],
      pastFestivalIds: [5, 4, 3, 2],
      partnersByReservation: empty,
    });

    expect(summary?.streak).toBe(2);
    expect(summary?.stands).toEqual(["A1"]);
  });

  it("gathers each partner once across reservations", () => {
    const juan = { id: 20, displayName: "Juan", imageUrl: null };
    const ana = { id: 21, displayName: "Ana", imageUrl: null };
    const summary = buildHistorySummary({
      participations: [
        participation({ festivalId: 1, name: "A", start: "2025-08-01", stand: "A1", reservationId: 100 }),
        participation({ festivalId: 2, name: "B", start: "2026-04-01", stand: "A2", reservationId: 101 }),
      ],
      pastFestivalIds: [2, 1],
      partnersByReservation: new Map([
        [100, [juan]],
        [101, [juan, ana]],
      ]),
    });

    expect(summary?.partners.map((partner) => partner.displayName)).toEqual([
      "Juan",
      "Ana",
    ]);
  });
});
