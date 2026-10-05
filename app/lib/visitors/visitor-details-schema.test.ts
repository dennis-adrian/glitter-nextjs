import { afterEach, describe, expect, it, vi } from "vitest";

import { visitorDetailsSchema } from "@/app/lib/visitors/visitor-details-schema";

const valid = {
  firstName: "María José",
  lastName: "O'Brien-Pérez",
  birthdate: "2000-05-17",
  phoneNumber: "+59171234567",
  gender: "female" as const,
};

afterEach(() => {
  vi.useRealTimers();
});

describe("visitorDetailsSchema", () => {
  it("accepts a typical visitor", () => {
    expect(visitorDetailsSchema.safeParse(valid).success).toBe(true);
  });

  it.each(["Ma. Fernanda", "O’Brien", "Jose\u0301", "Ana  María", "D'Angelo"])(
    "accepts %j as a name",
    (firstName) => {
      expect(
        visitorDetailsSchema.safeParse({ ...valid, firstName }).success,
      ).toBe(true);
    },
  );

  it.each([
    "Visita www.estafa.com",
    "estafa.com",
    "Ana2",
    "<b>Ana</b>",
    "A",
    ".Ana",
    "x".repeat(61),
  ])(
    "refuses %j as a name",
    (firstName) => {
      expect(
        visitorDetailsSchema.safeParse({ ...valid, firstName }).success,
      ).toBe(false);
    },
  );

  it.each(["", "17/05/2000", "2000-13-01", "1899-12-31", "2000-02-30"])(
    "refuses %j as a birthdate",
    (birthdate) => {
      expect(
        visitorDetailsSchema.safeParse({ ...valid, birthdate }).success,
      ).toBe(false);
    },
  );

  it("needs visitors to be at least ten, counting the store's today", () => {
    vi.useFakeTimers();
    // Already the 25th in UTC, still the 24th in La Paz.
    vi.setSystemTime(new Date("2026-10-25T02:00:00Z"));
    expect(
      visitorDetailsSchema.safeParse({ ...valid, birthdate: "2016-10-24" })
        .success,
    ).toBe(true);
    expect(
      visitorDetailsSchema.safeParse({ ...valid, birthdate: "2016-10-25" })
        .success,
    ).toBe(false);
  });

  it("refuses a gender outside the list", () => {
    expect(
      visitorDetailsSchema.safeParse({ ...valid, gender: "robot" }).success,
    ).toBe(false);
  });
});
