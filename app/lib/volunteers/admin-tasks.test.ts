import { describe, expect, it } from "vitest";

import {
  availabilityDiff,
  availabilitySummary,
  busiestDayOverLimit,
  coverageBadge,
  coveragePercent,
  formatShiftWeekdayStart,
  nextAfterDecision,
  parseVolunteerReviewSort,
  remainingPlaces,
  reviewPosition,
  shiftsByNeed,
  volunteerCloseLine,
  volunteerReviewHref,
  volunteerShiftBatchInputSchema,
} from "@/app/lib/volunteers/admin-tasks";

const at = (iso: string) => new Date(iso);

function shift(
  id: number,
  needed: number,
  assigned: number,
  acceptedUnassigned = 10,
  startsAt = `2026-12-19T1${id}:00:00Z`,
  isActive = true,
) {
  return {
    id,
    startsAt: at(startsAt),
    isActive,
    neededHeadcount: needed,
    assignedCount: assigned,
    acceptedUnassignedCount: acceptedUnassigned,
  };
}

describe("review sort and paths", () => {
  it("falls back to oldest first", () => {
    expect(parseVolunteerReviewSort("nuevas")).toBe("nuevas");
    expect(parseVolunteerReviewSort("turnos")).toBe("turnos");
    expect(parseVolunteerReviewSort("x")).toBe("antiguas");
    expect(parseVolunteerReviewSort(["nuevas"])).toBe("antiguas");
  });

  it("carries a non-default sort", () => {
    expect(volunteerReviewHref(3, "antiguas")).toBe(
      "/dashboard/festivals/3/volunteers",
    );
    expect(volunteerReviewHref(3, "turnos", 9)).toBe(
      "/dashboard/festivals/3/volunteers/9?orden=turnos",
    );
  });
});

describe("reviewPosition and nextAfterDecision", () => {
  const ids = [5, 8, 2];
  it("gives the position and neighbours", () => {
    expect(reviewPosition(ids, 8)).toEqual({
      position: 2,
      total: 3,
      previousId: 5,
      nextId: 2,
    });
    expect(reviewPosition(ids, 5).previousId).toBeNull();
    expect(reviewPosition(ids, 2).nextId).toBeNull();
    expect(reviewPosition(ids, 7)).toMatchObject({ position: 0, nextId: 5 });
  });

  it("moves to the next pending one, else the previous, else none", () => {
    expect(nextAfterDecision(ids, 5)).toBe(8);
    expect(nextAfterDecision(ids, 2)).toBe(8);
    expect(nextAfterDecision([4], 4)).toBeNull();
    expect(nextAfterDecision(ids, 99)).toBe(5);
  });
});

describe("coverage", () => {
  it("labels the badge", () => {
    expect(coverageBadge(shift(1, 0, 0))).toEqual({
      label: "Sin cupo",
      variant: "outline",
    });
    expect(coverageBadge(shift(1, 6, 6))).toEqual({
      label: "Completo",
      variant: "green",
    });
    expect(coverageBadge(shift(1, 10, 5, 9))).toEqual({
      label: "Faltan 5",
      variant: "amber",
    });
    expect(coverageBadge(shift(1, 10, 2, 4))).toEqual({
      label: "Faltan 8",
      variant: "red",
    });
  });

  it("sorts active shifts by people missing, full and unset last", () => {
    const order = shiftsByNeed([
      shift(1, 8, 4),
      shift(2, 6, 6),
      shift(3, 10, 2),
      shift(4, 0, 0),
      shift(5, 10, 0, 10, "2026-12-19T15:00:00Z", false),
      shift(6, 10, 6),
    ]).map((s) => s.id);
    expect(order).toEqual([3, 1, 6, 2, 4]);
  });

  it("counts places and shifts still to fill", () => {
    expect(
      remainingPlaces([shift(1, 8, 4), shift(2, 6, 7), shift(3, 10, 2)]),
    ).toEqual({ places: 12, shifts: 2 });
    expect(coveragePercent(shift(1, 8, 4))).toBe(50);
    expect(coveragePercent(shift(1, 0, 0))).toBe(0);
    expect(coveragePercent(shift(1, 2, 5))).toBe(100);
  });
});

describe("wording", () => {
  it("formats the weekday start and the closing line", () => {
    // 10:00 in La Paz
    expect(
      formatShiftWeekdayStart({ startsAt: at("2026-12-19T14:00:00Z") }),
    ).toBe("Sáb 10:00");
    const close = at("2026-12-01T03:59:00Z");
    expect(volunteerCloseLine(close, at("2026-11-22T12:00:00Z"))).toBe(
      "Cierran el lunes 30 de noviembre, 23:59",
    );
    expect(
      volunteerCloseLine(close, at("2026-12-02T12:00:00Z"), { long: true }),
    ).toBe("Cerraron el lunes 30 de noviembre a las 23:59.");
  });

  it("finds a day over the limit", () => {
    const sat = (hour: number) => ({
      startsAt: at(`2026-12-19T${hour}:00:00Z`),
    });
    expect(busiestDayOverLimit([sat(14), sat(17)])).toBeNull();
    expect(busiestDayOverLimit([sat(14), sat(17), sat(21)])).toEqual({
      day: "2026-12-19",
      count: 3,
    });
  });
});

describe("availability edits", () => {
  it("diffs and summarises", () => {
    const diff = availabilityDiff([1, 2, 3], [2, 3, 4], [1, 3]);
    expect(diff).toEqual({ added: [4], removed: [1], unassigned: [1] });
    expect(availabilitySummary(diff)).toBe("Agregás 1 turno y quitás 1");
    expect(availabilitySummary(availabilityDiff([1], [1], []))).toBe(
      "Sin cambios",
    );
    expect(availabilitySummary(availabilityDiff([1, 2], [], []))).toBe(
      "Quitás 2 turnos",
    );
  });
});

describe("volunteerShiftBatchInputSchema", () => {
  it("refuses an empty or repeated batch", () => {
    expect(
      volunteerShiftBatchInputSchema.safeParse({
        festivalId: 1,
        shiftId: 1,
        people: [],
      }).success,
    ).toBe(false);
    expect(
      volunteerShiftBatchInputSchema.safeParse({
        festivalId: 1,
        shiftId: 1,
        people: [
          { applicationId: 2, roleId: 1 },
          { applicationId: 2, roleId: 3 },
        ],
      }).success,
    ).toBe(false);
  });
});
