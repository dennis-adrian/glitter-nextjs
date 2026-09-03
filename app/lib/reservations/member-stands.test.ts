import { describe, expect, it } from "vitest";

import {
  reservationStandCount,
  summarizeReservationStands,
} from "@/app/lib/reservations/member-stands";

function member(
  id: number,
  overrides: Partial<{
    label: string;
    standCategory: string;
    releasedAt: Date | null;
    position: number;
  }> = {},
) {
  return {
    id,
    label: overrides.label ?? "A",
    standNumber: id,
    standCategory: overrides.standCategory ?? "illustration",
    releasedAt: overrides.releasedAt ?? null,
    position: overrides.position ?? id - 1,
  };
}

describe("summarizeReservationStands", () => {
  it("describes a single stand as half a table", () => {
    const summary = summarizeReservationStands([member(1)]);

    expect(summary.isFullTable).toBe(false);
    expect(summary.label).toBe("A1");
    expect(summary.dimensions).toBe("60cm x 120cm");
    expect(summary.primary?.id).toBe(1);
  });

  it("describes two stands as a full table", () => {
    const summary = summarizeReservationStands([member(1), member(2)]);

    expect(summary.isFullTable).toBe(true);
    expect(summary.label).toBe("A1 y A2");
    expect(summary.dimensions).toBe("60cm x 240cm");
  });

  it("orders by position, not by insertion", () => {
    const summary = summarizeReservationStands([
      member(2, { position: 1 }),
      member(1, { position: 0 }),
    ]);

    expect(summary.label).toBe("A1 y A2");
    // Position 0 is the half the participant originally picked.
    expect(summary.primary?.id).toBe(1);
  });

  it("drops a released half from the occupied set but keeps it as history", () => {
    const summary = summarizeReservationStands([
      member(1, { position: 0 }),
      member(2, { position: 1, releasedAt: new Date() }),
    ]);

    expect(summary.isFullTable).toBe(false);
    expect(summary.label).toBe("A1");
    expect(summary.dimensions).toBe("60cm x 120cm");
    expect(summary.released.map((row) => row.id)).toEqual([2]);
  });

  it("keeps naming the original half after a downgrade released it", () => {
    // An admin downgrade retains position 0, but a correction could in
    // principle release it; the summary should still report which half came
    // first rather than losing the provenance.
    const summary = summarizeReservationStands([
      member(1, { position: 0, releasedAt: new Date() }),
      member(2, { position: 1 }),
    ]);

    expect(summary.active.map((row) => row.id)).toEqual([2]);
    expect(summary.primary?.id).toBe(2);
    expect(summary.released.map((row) => row.id)).toEqual([1]);
  });

  it("uses the gastronomy footprint regardless of member count", () => {
    const summary = summarizeReservationStands([
      member(1, { standCategory: "gastronomy" }),
    ]);

    expect(summary.dimensions).toBe("140cm x 70cm");
  });

  it("survives a reservation with no members", () => {
    const summary = summarizeReservationStands([]);

    expect(summary.primary).toBeNull();
    expect(summary.label).toBe("");
    expect(summary.isFullTable).toBe(false);
  });
});

describe("reservationStandCount", () => {
  const stand = { label: "A", standNumber: 1 };

  it("counts a full table's two halves", () => {
    expect(
      reservationStandCount({
        stand,
        members: [
          { position: 0, releasedAt: null, stand },
          {
            position: 1,
            releasedAt: null,
            stand: { label: "A", standNumber: 2 },
          },
        ],
      }),
    ).toBe(2);
  });

  it("ignores released halves", () => {
    expect(
      reservationStandCount({
        stand,
        members: [
          { position: 0, releasedAt: null, stand },
          {
            position: 1,
            releasedAt: new Date(),
            stand: { label: "A", standNumber: 2 },
          },
        ],
      }),
    ).toBe(1);
  });

  it("falls back to the selected half when membership was not loaded", () => {
    expect(reservationStandCount({ stand })).toBe(1);
  });
});
