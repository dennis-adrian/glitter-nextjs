import { describe, expect, it } from "vitest";

import {
  fullTablePriceSelection,
  isBookedRow,
  rowsBookedAsTable,
} from "@/app/components/maps/admin/stand-manage/full-table";

function row(id: number, reservations: { id: number; status: string }[]) {
  return { id, reservations };
}

describe("isBookedRow", () => {
  it("counts only reservations that still occupy the stand", () => {
    expect(isBookedRow(row(1, [{ id: 7, status: "accepted" }]))).toBe(true);
    expect(isBookedRow(row(1, [{ id: 7, status: "cancelled" }]))).toBe(false);
    expect(isBookedRow(row(1, []))).toBe(false);
  });
});

describe("rowsBookedAsTable", () => {
  it("leaves out a half booked on its own", () => {
    const booked = row(1, [{ id: 7, status: "pending" }]);
    const free = row(2, []);

    expect(rowsBookedAsTable([booked, free], [booked, free])).toEqual([]);
  });

  it("leaves out halves booked by separate reservations", () => {
    const left = row(1, [{ id: 7, status: "accepted" }]);
    const right = row(2, [{ id: 8, status: "accepted" }]);

    expect(rowsBookedAsTable([left, right], [left, right])).toEqual([]);
  });

  it("returns both halves of one reservation", () => {
    const left = row(1, [{ id: 7, status: "verification_payment" }]);
    const right = row(2, [{ id: 7, status: "verification_payment" }]);

    expect(rowsBookedAsTable([left, right], [left, right])).toEqual([
      left,
      right,
    ]);
  });

  it("counts a second stand outside the selection", () => {
    const selected = row(1, [{ id: 7, status: "accepted" }]);
    const free = row(2, []);
    const elsewhere = row(3, [{ id: 7, status: "accepted" }]);

    expect(
      rowsBookedAsTable([selected, free], [selected, free, elsewhere]),
    ).toEqual([selected]);
  });

  it("ignores a cancelled reservation on both halves", () => {
    const left = row(1, [{ id: 7, status: "cancelled" }]);
    const right = row(2, [{ id: 7, status: "cancelled" }]);

    expect(rowsBookedAsTable([left, right], [left, right])).toEqual([]);
  });
});

describe("fullTablePriceSelection", () => {
  const index = new Map([
    [1, { groupId: 10 }],
    [2, { groupId: 10 }],
    [3, { groupId: 20 }],
    [4, { groupId: 20 }],
  ]);

  it("reaches a table from a single half", () => {
    expect(fullTablePriceSelection([1], index)).toEqual({
      groupIds: [10],
      reason: null,
    });
  });

  it("collects every table the selection touches, once each", () => {
    expect(fullTablePriceSelection([4, 1, 2, 3], index)).toEqual({
      groupIds: [10, 20],
      reason: null,
    });
  });

  it("refuses a selection with no table in it", () => {
    expect(fullTablePriceSelection([5, 6], index).reason).toBe(
      "Ningún espacio seleccionado es mitad de una mesa completa.",
    );
  });

  it("refuses a selection mixing tables and loose stands", () => {
    const result = fullTablePriceSelection([1, 2, 5], index);
    expect(result.groupIds).toEqual([]);
    expect(result.reason).toBe(
      "Hay un espacio seleccionado que no es parte de una mesa completa.",
    );
    expect(fullTablePriceSelection([1, 5, 6], index).reason).toBe(
      "Hay 2 espacios seleccionados que no son parte de una mesa completa.",
    );
  });
});
