import { describe, expect, it } from "vitest";

import { canTransitionOrderStatus } from "@/app/lib/orders/status-transitions";

describe("canTransitionOrderStatus", () => {
  it("allows active operational transitions", () => {
    expect(canTransitionOrderStatus("pending", "processing")).toBe(true);
    expect(canTransitionOrderStatus("payment_verification", "processing")).toBe(
      true,
    );
    expect(canTransitionOrderStatus("payment_verification", "paid")).toBe(true);
    expect(canTransitionOrderStatus("paid", "delivered")).toBe(true);
  });

  it("locks terminal states and rejects backwards transitions", () => {
    expect(canTransitionOrderStatus("delivered", "paid")).toBe(false);
    expect(canTransitionOrderStatus("cancelled", "pending")).toBe(false);
    expect(canTransitionOrderStatus("paid", "pending")).toBe(false);
  });
});
