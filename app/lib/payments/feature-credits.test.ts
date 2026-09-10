import { describe, expect, it } from "vitest";

import {
  featureCreditReason,
  summarizeFeatureCredits,
  totalFeatureCredits,
  type FeatureCreditAction,
} from "@/app/lib/payments/feature-credits";

function action(
  overrides: Partial<FeatureCreditAction> = {},
): FeatureCreditAction {
  return {
    actionId: 1,
    type: "late_partner",
    status: "fulfilled",
    amount: 50,
    reversed: false,
    createdAt: new Date("2026-09-08T16:51:02.000Z"),
    items: [],
    ...overrides,
  };
}

describe("totalFeatureCredits", () => {
  it("sums what was charged", () => {
    expect(
      totalFeatureCredits([
        action({ actionId: 1, amount: 50 }),
        action({ actionId: 2, amount: 20, type: "full_table_access" }),
      ]),
    ).toBe(70);
  });

  it("ignores a refunded charge", () => {
    expect(
      totalFeatureCredits([
        action({ actionId: 1, amount: 50, reversed: true }),
        action({ actionId: 2, amount: 20 }),
      ]),
    ).toBe(20);
  });

  it("counts nothing for an action whose spend never posted", () => {
    // The ordinary shape of an uncaptured full-table hold: the action row
    // stands, priced, with no ledger entry behind it. Reading
    // `feature_price_snapshot` here would bill it.
    expect(
      totalFeatureCredits([
        action({ type: "full_table_access", status: "cancelled", amount: 0 }),
      ]),
    ).toBe(0);
  });
});

describe("summarizeFeatureCredits", () => {
  it("carries the reason alongside the total", () => {
    expect(summarizeFeatureCredits([action({ amount: 50 })])).toEqual({
      total: 50,
      types: ["late_partner"],
    });
  });

  it("lists each type once", () => {
    const summary = summarizeFeatureCredits([
      action({ actionId: 1, type: "full_table_access", amount: 20 }),
      action({ actionId: 2, type: "full_table_access", amount: 20 }),
      action({ actionId: 3, type: "late_partner", amount: 50 }),
    ]);
    expect(summary).toEqual({
      total: 90,
      types: ["full_table_access", "late_partner"],
    });
  });

  it("drops reversed and uncharged actions from the reason too", () => {
    // A refunded extra must not keep explaining a price it no longer accounts
    // for — the note exists to justify the cobro, so a stale reason is worse
    // than none.
    const summary = summarizeFeatureCredits([
      action({ actionId: 1, type: "late_partner", amount: 50, reversed: true }),
      action({ actionId: 2, type: "full_table_access", amount: 0 }),
    ]);
    expect(summary).toEqual({ total: 0, types: [] });
  });
});

describe("featureCreditReason", () => {
  it("phrases each type for mid-sentence use", () => {
    expect(featureCreditReason(["late_partner"])).toBe("compañero agregado");
    expect(featureCreditReason(["full_table_access", "late_partner"])).toBe(
      "mesa completa · compañero agregado",
    );
  });

  it("is empty when nothing was charged", () => {
    expect(featureCreditReason([])).toBe("");
  });
});
