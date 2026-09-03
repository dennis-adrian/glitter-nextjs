import { describe, expect, it } from "vitest";

import { resolveFullTableSelection } from "@/app/lib/reservations/full-table-selection";

import type { ReservationMapStandDto } from "@/app/lib/reservations/dto";

function stand(
  overrides: Partial<ReservationMapStandDto> & { id: number },
): ReservationMapStandDto {
  return {
    label: "A",
    standNumber: overrides.id,
    effectiveStatus: "available",
    status: "available",
    positionLeft: 0,
    positionTop: 0,
    width: 10,
    height: 10,
    standCategory: "illustration",
    participationType: "standard",
    price: 100,
    eligibleSubcategoryIds: [],
    festivalSectorId: 1,
    standGroupId: 7,
    isFullTableHalf: true,
    occupantKey: null,
    hasExternalOccupant: false,
    visibleParticipantSummaries: [],
    ...overrides,
  };
}

describe("resolveFullTableSelection", () => {
  it("says nothing when the participant has no access", () => {
    const a = stand({ id: 1 });
    const b = stand({ id: 2 });

    expect(
      resolveFullTableSelection({
        stand: a,
        sectorStands: [a, b],
        accessActive: false,
      }),
    ).toEqual({ kind: "none" });
  });

  it("says nothing for a stand that is not half of a declared table", () => {
    const a = stand({ id: 1, isFullTableHalf: false, standGroupId: null });

    expect(
      resolveFullTableSelection({
        stand: a,
        sectorStands: [a],
        accessActive: true,
      }),
    ).toEqual({ kind: "none" });
  });

  it("reports a full table when both halves are free", () => {
    const a = stand({ id: 1 });
    const b = stand({ id: 2 });

    expect(
      resolveFullTableSelection({
        stand: a,
        sectorStands: [a, b],
        accessActive: true,
      }),
    ).toEqual({ kind: "full", companion: b });
  });

  it.each(["reserved", "confirmed", "held", "disabled"] as const)(
    "falls back when the companion is %s",
    (status) => {
      const a = stand({ id: 1 });
      const b = stand({ id: 2, effectiveStatus: status, status });

      expect(
        resolveFullTableSelection({
          stand: a,
          sectorStands: [a, b],
          accessActive: true,
        }),
      ).toEqual({ kind: "fallback", companion: b });
    },
  );

  it("ignores stands from another group", () => {
    const a = stand({ id: 1, standGroupId: 7 });
    const other = stand({ id: 2, standGroupId: 8 });

    // No companion in the pair, so there is nothing to promise.
    expect(
      resolveFullTableSelection({
        stand: a,
        sectorStands: [a, other],
        accessActive: true,
      }),
    ).toEqual({ kind: "fallback", companion: null });
  });

  it("falls back rather than guessing when the group is malformed", () => {
    const a = stand({ id: 1 });
    const b = stand({ id: 2 });
    const c = stand({ id: 3 });

    // Three stands in one full_table group is malformed; there is no
    // unambiguous companion to pair with.
    expect(
      resolveFullTableSelection({
        stand: a,
        sectorStands: [a, b, c],
        accessActive: true,
      }),
    ).toEqual({ kind: "fallback", companion: null });
  });
});
