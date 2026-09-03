import { describe, expect, it } from "vitest";

import {
  allFeatureScopes,
  type FeatureConfigRow,
  LATE_PARTNER_DEFAULT_LEAD_DAYS,
  resolveFeatureConfig,
  resolveLatePartnerDeadline,
} from "@/app/lib/festivals/feature-config";

const DAY_MS = 24 * 60 * 60 * 1000;
const now = new Date("2026-09-02T12:00:00.000Z");
const festivalStart = new Date("2026-11-01T00:00:00.000Z");

function row(overrides: Partial<FeatureConfigRow> = {}): FeatureConfigRow {
  return {
    id: 1,
    type: "late_partner",
    category: null,
    enabled: true,
    creditPrice: 50,
    deadlineOverrideAt: null,
    ...overrides,
  };
}

describe("resolveLatePartnerDeadline", () => {
  it("defaults to the earliest start minus the lead time", () => {
    const deadline = resolveLatePartnerDeadline({
      deadlineOverrideAt: null,
      earliestStartDate: festivalStart,
    });
    expect(deadline).toEqual(
      new Date(festivalStart.getTime() - LATE_PARTNER_DEFAULT_LEAD_DAYS * DAY_MS),
    );
  });

  it("prefers an explicit override over the festival start", () => {
    const override = new Date("2026-10-01T00:00:00.000Z");
    expect(
      resolveLatePartnerDeadline({
        deadlineOverrideAt: override,
        earliestStartDate: festivalStart,
      }),
    ).toEqual(override);
  });

  it("returns null with no start date and no override", () => {
    expect(
      resolveLatePartnerDeadline({
        deadlineOverrideAt: null,
        earliestStartDate: null,
      }),
    ).toBeNull();
  });

  it("uses the override even when the festival has no dates", () => {
    const override = new Date("2026-10-01T00:00:00.000Z");
    expect(
      resolveLatePartnerDeadline({
        deadlineOverrideAt: override,
        earliestStartDate: null,
      }),
    ).toEqual(override);
  });
});

describe("resolveFeatureConfig", () => {
  it("marks a disabled feature unavailable whatever the dates say", () => {
    const result = resolveFeatureConfig(row({ enabled: false }), {
      earliestStartDate: festivalStart,
      now,
    });
    expect(result.available).toBe(false);
    expect(result.unavailableReason).toContain("desactivada");
  });

  it("offers late partner before the deadline", () => {
    const result = resolveFeatureConfig(row(), {
      earliestStartDate: festivalStart,
      now,
    });
    expect(result.available).toBe(true);
    expect(result.unavailableReason).toBeNull();
    expect(result.effectiveDeadlineAt).toEqual(
      new Date(festivalStart.getTime() - LATE_PARTNER_DEFAULT_LEAD_DAYS * DAY_MS),
    );
  });

  it("withdraws late partner at and after the deadline", () => {
    const deadline = new Date("2026-09-02T12:00:00.000Z");
    const atDeadline = resolveFeatureConfig(
      row({ deadlineOverrideAt: deadline }),
      { earliestStartDate: festivalStart, now },
    );
    expect(atDeadline.available).toBe(false);
    expect(atDeadline.unavailableReason).toContain("venció");

    const afterDeadline = resolveFeatureConfig(
      row({ deadlineOverrideAt: new Date(deadline.getTime() - 1000) }),
      { earliestStartDate: festivalStart, now },
    );
    expect(afterDeadline.available).toBe(false);
  });

  it("makes late partner unavailable when no deadline can be computed", () => {
    const result = resolveFeatureConfig(row(), {
      earliestStartDate: null,
      now,
    });
    expect(result.effectiveDeadlineAt).toBeNull();
    expect(result.available).toBe(false);
    expect(result.unavailableReason).toContain("fecha de inicio");
  });

  it("does not apply a deadline to other feature types", () => {
    for (const type of ["full_table", "reservation_release"] as const) {
      const result = resolveFeatureConfig(
        row({
          type,
          category: type === "full_table" ? "illustration" : null,
          // A stray override must not leak into a type that has no deadline.
          deadlineOverrideAt: new Date("2020-01-01T00:00:00.000Z"),
        }),
        { earliestStartDate: null, now },
      );
      expect(result.effectiveDeadlineAt).toBeNull();
      expect(result.available).toBe(true);
    }
  });
});

describe("allFeatureScopes", () => {
  it("covers full table per eligible category and the festival-wide types", () => {
    expect(allFeatureScopes()).toEqual([
      { type: "full_table", category: "illustration" },
      { type: "full_table", category: "entrepreneurship" },
      { type: "late_partner", category: null },
      { type: "reservation_release", category: null },
    ]);
  });
});
