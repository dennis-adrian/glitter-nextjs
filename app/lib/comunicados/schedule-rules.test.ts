import { describe, expect, it } from "vitest";

import {
  isScheduleOverdue,
  SCHEDULE_DATE_MESSAGES,
  scheduleAtProblem,
} from "@/app/lib/comunicados/schedule-rules";

const NOW = Date.parse("2026-10-26T14:12:00.000Z");
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

function at(offsetMs: number) {
  return new Date(NOW + offsetMs);
}

describe("scheduleAtProblem", () => {
  it("takes exactly 5 minutes ahead, and refuses a millisecond less", () => {
    expect(scheduleAtProblem(at(5 * MINUTE), NOW)).toBeNull();
    expect(scheduleAtProblem(at(5 * MINUTE - 1), NOW)).toBe(
      SCHEDULE_DATE_MESSAGES.tooSoon,
    );
  });

  it("refuses a time already gone", () => {
    expect(scheduleAtProblem(at(-MINUTE), NOW)).toBe(
      "Elegí una hora al menos 5 minutos más adelante.",
    );
  });

  it("takes exactly 60 days ahead, and refuses a millisecond more", () => {
    expect(scheduleAtProblem(at(60 * DAY), NOW)).toBeNull();
    expect(scheduleAtProblem(at(60 * DAY + 1), NOW)).toBe(
      "Elegí una fecha dentro de los próximos 60 días.",
    );
  });

  it("refuses a date that is not one", () => {
    expect(scheduleAtProblem(new Date("31/10/2026 9:00"), NOW)).toBe(
      "Elegí una fecha y hora válidas.",
    );
  });
});

describe("isScheduleOverdue", () => {
  const scheduledAt = at(0);

  it("is overdue from exactly 3 minutes past its time", () => {
    expect(isScheduleOverdue(scheduledAt, at(3 * MINUTE))).toBe(true);
    expect(isScheduleOverdue(scheduledAt, at(45 * MINUTE))).toBe(true);
  });

  it("is not overdue at 2:59, nor before its time", () => {
    expect(isScheduleOverdue(scheduledAt, at(2 * MINUTE + 59_000))).toBe(false);
    expect(isScheduleOverdue(scheduledAt, at(3 * MINUTE - 1))).toBe(false);
    expect(isScheduleOverdue(scheduledAt, at(-DAY))).toBe(false);
  });
});
