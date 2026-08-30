import { describe, expect, it } from "vitest";

import { roundMoney } from "@/app/lib/reservations/money";
import { isLiveSelfServiceSource } from "@/app/lib/reservations/policy";

describe("reservation money rounding", () => {
  it("rounds to cents", () => {
    expect(roundMoney(10.005)).toBe(10.01);
    expect(roundMoney(99.994)).toBe(99.99);
  });
});

describe("live self-service source", () => {
  it("treats legacy_unknown as blocking occupancy", () => {
    expect(isLiveSelfServiceSource("user_reservation")).toBe(true);
    expect(isLiveSelfServiceSource("legacy_unknown")).toBe(true);
    expect(isLiveSelfServiceSource("admin_assignment")).toBe(false);
  });
});
