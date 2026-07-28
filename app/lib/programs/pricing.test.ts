import { describe, expect, it } from "vitest";

import {
  applyDiscount,
  isFreePrice,
  participantSavings,
  resolvePrice,
  roundMoney,
  type ParticipantDiscount,
  type PriceInput,
} from "@/app/lib/programs/pricing";

const NO_DISCOUNT: ParticipantDiscount = { type: "percent", value: 0 };

function percent(value: number): ParticipantDiscount {
  return { type: "percent", value };
}

function fixed(value: number): ParticipantDiscount {
  return { type: "fixed", value };
}

function priceInput(overrides: Partial<PriceInput> = {}): PriceInput {
  return {
    publicPrice: 100,
    participantPrice: null,
    programDiscount: null,
    globalDiscount: NO_DISCOUNT,
    ...overrides,
  };
}

describe("roundMoney", () => {
  it("rounds half up to two decimals", () => {
    expect(roundMoney(84.9915)).toBe(84.99);
    expect(roundMoney(127.5)).toBe(127.5);
    expect(roundMoney(10.005)).toBe(10.01);
    expect(roundMoney(0.145)).toBe(0.15);
    expect(roundMoney(10.075)).toBe(10.08);
    expect(roundMoney(100)).toBe(100);
  });
});

describe("applyDiscount", () => {
  it("takes a share off for a percentage", () => {
    expect(applyDiscount(100, percent(15))).toBe(85);
    expect(applyDiscount(99.99, percent(15))).toBe(84.99);
  });

  it("takes a flat amount off for a fixed discount", () => {
    expect(applyDiscount(100, fixed(10))).toBe(90);
    expect(applyDiscount(99.99, fixed(10))).toBe(89.99);
  });

  it("clamps a fixed discount larger than the price to zero", () => {
    expect(applyDiscount(30, fixed(50))).toBe(0);
    expect(applyDiscount(30, fixed(30))).toBe(0);
  });

  it("rejects negative values and percentages above 100", () => {
    expect(() => applyDiscount(100, fixed(-1))).toThrow(
      /Invalid discount value/,
    );
    expect(() => applyDiscount(100, percent(150))).toThrow(
      /Invalid discount percent/,
    );
  });

  it("allows a fixed discount above 100, which is not a percentage", () => {
    expect(applyDiscount(500, fixed(150))).toBe(350);
  });
});

describe("resolvePrice", () => {
  it("charges the public price to a public buyer, ignoring participant rules", () => {
    const resolved = resolvePrice(
      priceInput({ participantPrice: 50, programDiscount: percent(30) }),
      "public",
    );

    expect(resolved.amount).toBe(100);
    expect(resolved.rule).toBe("public");
    expect(resolved.snapshot.appliedDiscount).toBeNull();
  });

  it("prefers an explicit participant price over any discount", () => {
    const resolved = resolvePrice(
      priceInput({
        participantPrice: 60,
        programDiscount: percent(10),
        globalDiscount: percent(25),
      }),
      "active_participant",
    );

    expect(resolved.amount).toBe(60);
    expect(resolved.rule).toBe("explicit_override");
  });

  it("prefers the program discount over the global default", () => {
    const resolved = resolvePrice(
      priceInput({
        programDiscount: percent(15),
        globalDiscount: percent(25),
      }),
      "active_participant",
    );

    expect(resolved.amount).toBe(85);
    expect(resolved.rule).toBe("program_discount");
    expect(resolved.snapshot.appliedDiscount).toEqual(percent(15));
  });

  it("applies a fixed program discount", () => {
    const resolved = resolvePrice(
      priceInput({ publicPrice: 120, programDiscount: fixed(10) }),
      "active_participant",
    );

    expect(resolved.amount).toBe(110);
    expect(resolved.rule).toBe("program_discount");
    expect(resolved.snapshot.appliedDiscount).toEqual(fixed(10));
  });

  it("applies a fixed global discount", () => {
    const resolved = resolvePrice(
      priceInput({ globalDiscount: fixed(20) }),
      "active_participant",
    );

    expect(resolved.amount).toBe(80);
    expect(resolved.rule).toBe("global_discount");
  });

  it("lets a program override a global percentage with a fixed amount", () => {
    const resolved = resolvePrice(
      priceInput({
        publicPrice: 200,
        programDiscount: fixed(25),
        globalDiscount: percent(50),
      }),
      "active_participant",
    );

    expect(resolved.amount).toBe(175);
    expect(resolved.snapshot.appliedDiscount).toEqual(fixed(25));
  });

  it("treats a zero program discount as a real override, not as absent", () => {
    const resolved = resolvePrice(
      priceInput({ programDiscount: percent(0), globalDiscount: percent(40) }),
      "active_participant",
    );

    expect(resolved.amount).toBe(100);
    expect(resolved.rule).toBe("program_discount");
  });

  it("keeps a free session free for everyone", () => {
    const input = priceInput({ publicPrice: 0, globalDiscount: percent(20) });

    expect(resolvePrice(input, "public").amount).toBe(0);
    expect(resolvePrice(input, "active_participant").amount).toBe(0);
  });

  it("never charges below zero when a fixed discount exceeds the price", () => {
    const resolved = resolvePrice(
      priceInput({ publicPrice: 15, globalDiscount: fixed(40) }),
      "active_participant",
    );

    expect(resolved.amount).toBe(0);
    expect(isFreePrice(resolved.amount)).toBe(true);
  });

  it("snapshots the inputs alongside the result", () => {
    const resolved = resolvePrice(
      priceInput({ publicPrice: 150, globalDiscount: percent(10) }),
      "active_participant",
    );

    expect(resolved.snapshot).toEqual({
      rule: "global_discount",
      basis: "active_participant",
      publicPrice: 150,
      participantPrice: null,
      appliedDiscount: percent(10),
      amount: 135,
    });
  });

  it("allows a full percentage discount", () => {
    const resolved = resolvePrice(
      priceInput({ globalDiscount: percent(100) }),
      "active_participant",
    );

    expect(resolved.amount).toBe(0);
  });

  it("rejects discount values outside their valid range", () => {
    expect(() =>
      resolvePrice(
        priceInput({ globalDiscount: percent(-10) }),
        "active_participant",
      ),
    ).toThrow(/Invalid discount value/);

    expect(() =>
      resolvePrice(
        priceInput({ programDiscount: percent(150) }),
        "active_participant",
      ),
    ).toThrow(/Invalid discount percent/);
  });
});

describe("participantSavings", () => {
  it("reports the difference against the public price", () => {
    expect(
      participantSavings(priceInput({ globalDiscount: percent(25) })),
    ).toBe(25);
    expect(participantSavings(priceInput({ globalDiscount: fixed(15) }))).toBe(
      15,
    );
    expect(participantSavings(priceInput({ participantPrice: 70 }))).toBe(30);
    expect(participantSavings(priceInput())).toBe(0);
  });

  it("caps savings at the price when a fixed discount overshoots", () => {
    expect(
      participantSavings(
        priceInput({ publicPrice: 20, globalDiscount: fixed(50) }),
      ),
    ).toBe(20);
  });
});
