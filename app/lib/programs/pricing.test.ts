import { describe, expect, it } from "vitest";

import {
  isFreePrice,
  participantSavings,
  resolvePrice,
  roundMoney,
  type PriceInput,
} from "@/app/lib/programs/pricing";

function priceInput(overrides: Partial<PriceInput> = {}): PriceInput {
  return {
    publicPrice: 100,
    participantPrice: null,
    programDiscountPercent: null,
    globalDiscountPercent: 0,
    ...overrides,
  };
}

describe("roundMoney", () => {
  it("rounds half up to two decimals", () => {
    expect(roundMoney(84.9915)).toBe(84.99);
    expect(roundMoney(127.5)).toBe(127.5);
    expect(roundMoney(10.005)).toBe(10.01);
    expect(roundMoney(0.145)).toBe(0.15);
    expect(roundMoney(100)).toBe(100);
  });
});

describe("resolvePrice", () => {
  it("charges the public price to a public buyer, ignoring participant rules", () => {
    const resolved = resolvePrice(
      priceInput({ participantPrice: 50, programDiscountPercent: 30 }),
      "public",
    );

    expect(resolved.amount).toBe(100);
    expect(resolved.rule).toBe("public");
    expect(resolved.basis).toBe("public");
    expect(resolved.snapshot.appliedDiscountPercent).toBeNull();
  });

  it("prefers an explicit participant price over any discount", () => {
    const resolved = resolvePrice(
      priceInput({
        participantPrice: 60,
        programDiscountPercent: 10,
        globalDiscountPercent: 25,
      }),
      "active_participant",
    );

    expect(resolved.amount).toBe(60);
    expect(resolved.rule).toBe("explicit_override");
  });

  it("prefers the program discount over the global default", () => {
    const resolved = resolvePrice(
      priceInput({ programDiscountPercent: 15, globalDiscountPercent: 25 }),
      "active_participant",
    );

    expect(resolved.amount).toBe(85);
    expect(resolved.rule).toBe("program_discount");
    expect(resolved.snapshot.appliedDiscountPercent).toBe(15);
  });

  it("falls back to the global discount", () => {
    const resolved = resolvePrice(
      priceInput({ globalDiscountPercent: 20 }),
      "active_participant",
    );

    expect(resolved.amount).toBe(80);
    expect(resolved.rule).toBe("global_discount");
  });

  it("treats a zero program discount as a real override, not as absent", () => {
    const resolved = resolvePrice(
      priceInput({ programDiscountPercent: 0, globalDiscountPercent: 40 }),
      "active_participant",
    );

    expect(resolved.amount).toBe(100);
    expect(resolved.rule).toBe("program_discount");
  });

  it("keeps a free session free for everyone", () => {
    const input = priceInput({ publicPrice: 0, globalDiscountPercent: 20 });

    expect(resolvePrice(input, "public").amount).toBe(0);
    expect(resolvePrice(input, "active_participant").amount).toBe(0);
  });

  it("rounds a discounted amount to two decimals", () => {
    const resolved = resolvePrice(
      priceInput({ publicPrice: 99.99, globalDiscountPercent: 15 }),
      "active_participant",
    );

    expect(resolved.amount).toBe(84.99);
  });

  it("snapshots the inputs alongside the result", () => {
    const resolved = resolvePrice(
      priceInput({ publicPrice: 150, globalDiscountPercent: 10 }),
      "active_participant",
    );

    expect(resolved.snapshot).toEqual({
      rule: "global_discount",
      basis: "active_participant",
      publicPrice: 150,
      participantPrice: null,
      appliedDiscountPercent: 10,
      amount: 135,
    });
  });

  it("allows a full discount", () => {
    const resolved = resolvePrice(
      priceInput({ globalDiscountPercent: 100 }),
      "active_participant",
    );

    expect(resolved.amount).toBe(0);
    expect(isFreePrice(resolved.amount)).toBe(true);
  });
});

describe("participantSavings", () => {
  it("reports the difference against the public price", () => {
    expect(participantSavings(priceInput({ globalDiscountPercent: 25 }))).toBe(
      25,
    );
    expect(participantSavings(priceInput({ participantPrice: 70 }))).toBe(30);
    expect(participantSavings(priceInput())).toBe(0);
  });
});
