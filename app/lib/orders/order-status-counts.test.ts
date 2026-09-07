import { describe, expect, it } from "vitest";

import {
  buildOrderStatusCounts,
  emptyOrderStatusCounts,
} from "@/app/lib/orders/order-status-counts";

describe("order status counts", () => {
  it("returns independent zero-filled count objects", () => {
    const first = emptyOrderStatusCounts();
    first.pending = 2;

    expect(emptyOrderStatusCounts()).toEqual({
      pending: 0,
      payment_verification: 0,
      processing: 0,
      paid: 0,
      delivered: 0,
      cancelled: 0,
      all: 0,
      needs_attention: 0,
    });
  });

  it("derives all and needs-attention facets from grouped rows", () => {
    expect(
      buildOrderStatusCounts([
        { status: "pending", count: 3 },
        { status: "payment_verification", count: 2 },
        { status: "paid", count: 4 },
        { status: "delivered", count: 1 },
      ]),
    ).toEqual({
      pending: 3,
      payment_verification: 2,
      processing: 0,
      paid: 4,
      delivered: 1,
      cancelled: 0,
      all: 10,
      needs_attention: 5,
    });
  });
});
