import { describe, expect, it } from "vitest";

import { resolveRecoveredPosSale } from "@/app/lib/fast-pass/pos-recovery";

describe("FastPass POS recovery", () => {
  it("restores the committed sale matching the persisted idempotency key", () => {
    expect(
      resolveRecoveredPosSale("same-sale", [
        {
          id: 42,
          idempotencyKey: "same-sale",
          totalAmount: 100,
          paidCount: 2,
          childCount: 3,
        },
      ]),
    ).toEqual({
      purchaseId: 42,
      total: 100,
      paidCount: 2,
      wristbandCount: 5,
    });
  });

  it("does not recover an unrelated operator sale", () => {
    expect(resolveRecoveredPosSale("missing", [])).toBeNull();
  });
});
