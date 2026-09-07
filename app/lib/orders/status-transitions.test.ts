import { describe, expect, it } from "vitest";

import {
  canCancelOrderStatus,
  canTransitionOrderStatus,
} from "@/app/lib/orders/status-transitions";

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

  it("allows cancel only before paid", () => {
    expect(canCancelOrderStatus("pending")).toBe(true);
    expect(canCancelOrderStatus("payment_verification")).toBe(true);
    expect(canCancelOrderStatus("processing")).toBe(true);
    expect(canCancelOrderStatus("paid")).toBe(false);
    expect(canCancelOrderStatus("delivered")).toBe(false);
    expect(canCancelOrderStatus("cancelled")).toBe(false);
  });
});
