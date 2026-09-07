import { describe, expect, it } from "vitest";

import {
  type FullTablePairMember,
  validateFullTablePair,
} from "@/app/lib/stands/full-table-pairs";

function member(
  overrides: Partial<FullTablePairMember> = {},
): FullTablePairMember {
  return {
    id: 1,
    label: "A1",
    standNumber: 1,
    festivalId: 10,
    festivalSectorId: 20,
    standCategory: "illustration",
    participationType: "standard",
    individualPrice: 200,
    sharedPrice: 300,
    positionLeft: 5,
    positionTop: 5,
    subcategoryIds: [7, 8],
    ...overrides,
  };
}

function pair(
  left: Partial<FullTablePairMember> = {},
  right: Partial<FullTablePairMember> = {},
) {
  return validateFullTablePair([
    member({ id: 1, label: "A1", standNumber: 1, ...left }),
    member({ id: 2, label: "A2", standNumber: 2, ...right }),
  ]);
}

function codes(result: ReturnType<typeof validateFullTablePair>) {
  return result.ok ? [] : result.problems.map((problem) => problem.code);
}

describe("validateFullTablePair", () => {
  it("accepts two matching illustration halves", () => {
    expect(pair()).toEqual({ ok: true });
  });

  it("accepts entrepreneurship halves regardless of shared price", () => {
    expect(
      pair(
        { standCategory: "entrepreneurship", sharedPrice: null },
        { standCategory: "entrepreneurship", sharedPrice: 999 },
      ),
    ).toEqual({ ok: true });
  });

  it("requires exactly two members and stops comparing", () => {
    for (const count of [0, 1, 3]) {
      const members = Array.from({ length: count }, (_, index) =>
        member({ id: index + 1, standNumber: index + 1 }),
      );
      const result = validateFullTablePair(members);
      expect(codes(result)).toEqual(["MEMBER_COUNT"]);
    }
  });

  it("reports the member count rather than guessing at a pair", () => {
    const result = validateFullTablePair([member(), member(), member()]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems[0].message).toContain("tiene 3");
  });

  it("rejects categories that cannot be sold as a full table", () => {
    expect(
      codes(
        pair({ standCategory: "gastronomy" }, { standCategory: "gastronomy" }),
      ),
    ).toContain("CATEGORY_NOT_ELIGIBLE");
  });

  it("rejects mismatched category, festival, sector, and participation type", () => {
    expect(codes(pair({}, { standCategory: "entrepreneurship" }))).toContain(
      "CATEGORY_MISMATCH",
    );
    expect(codes(pair({}, { festivalId: 11 }))).toContain("FESTIVAL_MISMATCH");
    expect(codes(pair({}, { festivalSectorId: 21 }))).toContain(
      "SECTOR_MISMATCH",
    );
    expect(codes(pair({}, { participationType: "premium" }))).toContain(
      "PARTICIPATION_TYPE_MISMATCH",
    );
  });

  it("compares subcategory eligibility as a set, not a sequence", () => {
    expect(
      pair({ subcategoryIds: [7, 8] }, { subcategoryIds: [8, 7] }),
    ).toEqual({ ok: true });
    expect(codes(pair({}, { subcategoryIds: [7] }))).toContain(
      "SUBCATEGORY_MISMATCH",
    );
  });

  it("requires identical individual prices and names both amounts", () => {
    const result = pair({}, { individualPrice: 250 });
    expect(codes(result)).toContain("INDIVIDUAL_PRICE_MISMATCH");
    if (result.ok) return;
    const message = result.problems.find(
      (problem) => problem.code === "INDIVIDUAL_PRICE_MISMATCH",
    )!.message;
    expect(message).toContain("Bs200.00");
    expect(message).toContain("Bs250.00");
  });

  it("names each half by label and number, not by the shared sector letter", () => {
    // Real stands carry the sector letter as their label, so naming a stand by
    // its label alone renders both halves of a pair identically — "B and B" —
    // and the admin cannot tell which one to go and fix.
    const result = validateFullTablePair([
      member({ id: 1, label: "B", standNumber: 27, sharedPrice: null }),
      member({ id: 2, label: "B", standNumber: 28, sharedPrice: null }),
    ]);
    if (result.ok) throw new Error("expected a missing shared price");
    const message = result.problems.find(
      (problem) => problem.code === "SHARED_PRICE_MISSING",
    )!.message;
    expect(message).toContain("B27");
    expect(message).toContain("B28");
  });

  it("requires illustration pairs to agree on a shared price", () => {
    expect(codes(pair({}, { sharedPrice: 350 }))).toContain(
      "SHARED_PRICE_MISMATCH",
    );
    expect(codes(pair({ sharedPrice: null }))).toContain(
      "SHARED_PRICE_MISSING",
    );
  });

  it("does not require a shared price outside illustration", () => {
    const result = pair(
      { standCategory: "entrepreneurship", sharedPrice: null },
      { standCategory: "entrepreneurship", sharedPrice: null },
    );
    expect(codes(result)).not.toContain("SHARED_PRICE_MISSING");
  });

  it("requires both halves to be placed on the map", () => {
    expect(codes(pair({ positionLeft: null }))).toContain("NOT_PLACED_ON_MAP");
    expect(codes(pair({}, { positionTop: null }))).toContain(
      "NOT_PLACED_ON_MAP",
    );
  });

  it("reports every problem at once so one fix pass is enough", () => {
    const result = pair(
      {},
      {
        festivalSectorId: 21,
        individualPrice: 250,
        sharedPrice: 400,
        positionTop: null,
      },
    );
    expect(codes(result)).toEqual(
      expect.arrayContaining([
        "NOT_PLACED_ON_MAP",
        "SECTOR_MISMATCH",
        "INDIVIDUAL_PRICE_MISMATCH",
        "SHARED_PRICE_MISMATCH",
      ]),
    );
  });
});
