import { describe, expect, it } from "vitest";

import {
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
