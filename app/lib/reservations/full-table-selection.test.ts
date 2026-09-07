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
  /**
   * Silence on an ordinary stand reads as the feature being broken. Somebody
   * holding access reasonably expects every stand to be half of something, so
   * the one that is not says so.
   */
  it("says a plain stand is a plain stand, to somebody holding access", () => {
    const a = stand({ id: 1, isFullTableHalf: false, standGroupId: null });

    expect(
      resolveFullTableSelection({
        stand: a,
        sectorStands: [a],
        accessActive: true,
      }),
    ).toEqual({ kind: "single" });
  });

  it("stays silent on a plain stand for somebody without access", () => {
    const a = stand({ id: 1, isFullTableHalf: false, standGroupId: null });

    expect(
      resolveFullTableSelection({
        stand: a,
        sectorStands: [a],
        accessActive: false,
      }),
    ).toEqual({ kind: "none" });
  });

  /**
   * Somebody already funded should not have to leave the map, press one
   * button on the panel, and come back. It is not a purchase — the fee comes
   * out of credits they already hold — so §7.2's ban on checkout in the map
   * does not reach it.
   */
  describe("activation offer", () => {
    it("offers activation to a funded participant on a whole pair", () => {
      const a = stand({ id: 1 });
      const b = stand({ id: 2 });

      expect(
        resolveFullTableSelection({
          stand: a,
          sectorStands: [a, b],
          accessActive: false,
          activationPrice: 90,
        }),
      ).toEqual({ kind: "offer", companion: b, creditPrice: 90 });
    });

    /**
     * Anyone who would have to top up first goes back to the panel, where the
     * purchase lives. Quoting a price they cannot meet, inside a timed map, is
     * the financial setup §7.2 keeps out.
     */
    it("says nothing to somebody who would have to buy first", () => {
      const a = stand({ id: 1 });
      const b = stand({ id: 2 });

      expect(
        resolveFullTableSelection({
          stand: a,
          sectorStands: [a, b],
          accessActive: false,
          activationPrice: null,
        }),
      ).toEqual({ kind: "none" });
    });

    /** No whole table left, so there is nothing to activate for. */
    it("withholds the offer when the companion is taken", () => {
      const a = stand({ id: 1 });
      const b = stand({ id: 2, effectiveStatus: "reserved" });

      expect(
        resolveFullTableSelection({
          stand: a,
          sectorStands: [a, b],
          accessActive: false,
          activationPrice: 90,
        }),
      ).toEqual({ kind: "none" });
    });

    it("withholds the offer on a malformed group", () => {
      const a = stand({ id: 1 });
      const b = stand({ id: 2 });
      const c = stand({ id: 3 });

      expect(
        resolveFullTableSelection({
          stand: a,
          sectorStands: [a, b, c],
          accessActive: false,
          activationPrice: 90,
        }),
      ).toEqual({ kind: "none" });
    });

    /** Holding access wins: there is nothing left to activate. */
    it("prefers the active state over the offer", () => {
      const a = stand({ id: 1 });
      const b = stand({ id: 2 });

      expect(
        resolveFullTableSelection({
          stand: a,
          sectorStands: [a, b],
          accessActive: true,
          activationPrice: 90,
        }),
      ).toEqual({ kind: "full", companion: b });
    });

    it("stays silent on a stand that is not half of a table", () => {
      const a = stand({ id: 1, isFullTableHalf: false, standGroupId: null });

      expect(
        resolveFullTableSelection({
          stand: a,
          sectorStands: [a],
          accessActive: false,
          activationPrice: 90,
        }),
      ).toEqual({ kind: "none" });
    });
  });

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
