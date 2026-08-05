import { describe, expect, it } from "vitest";

import {
  PROMO_CODE_ERROR_MESSAGES,
  buildProgramPriceSnapshot,
  isValidPromoCodeFormat,
  normalizePromoCode,
  promoCodeBlockerMessage,
  resolvePromoCodeValidity,
  resolvePromoPrice,
} from "@/app/lib/programs/promo-codes";

describe("promo code normalization", () => {
  it("normalizes human-entered codes", () => {
    expect(normalizePromoCode(" artista_50 ")).toBe("ARTISTA_50");
    expect(isValidPromoCodeFormat("ARTISTA-50")).toBe(true);
    expect(isValidPromoCodeFormat("dos palabras")).toBe(false);
    expect(isValidPromoCodeFormat("x")).toBe(false);
  });
});

describe("resolvePromoPrice", () => {
  it("replaces rather than compounds a participant discount", () => {
    expect(
      resolvePromoPrice({
        basePrice: 70,
        existingPrice: 56,
        discountPercent: 50,
      }),
    ).toEqual({
      basePrice: 70,
      existingPrice: 56,
      promoPrice: 35,
      discountAmount: 35,
      differenceFromExisting: -21,
      isHigherThanExisting: false,
    });
  });

  it("reports when a promo is worse than the existing price", () => {
    const result = resolvePromoPrice({
      basePrice: 70,
      existingPrice: 56,
      discountPercent: 10,
    });

    expect(result.promoPrice).toBe(63);
    expect(result.differenceFromExisting).toBe(7);
    expect(result.isHigherThanExisting).toBe(true);
  });

  it("floors fractional promo prices to whole bolivianos", () => {
    expect(
      resolvePromoPrice({
        basePrice: 101,
        existingPrice: 101,
        discountPercent: 50,
      }).promoPrice,
    ).toBe(50);
    expect(
      resolvePromoPrice({
        basePrice: 99.99,
        existingPrice: 99.99,
        discountPercent: 50,
      }).promoPrice,
    ).toBe(49);
  });

  it("supports a zero-total promo", () => {
    expect(
      resolvePromoPrice({
        basePrice: 1,
        existingPrice: 1,
        discountPercent: 50,
      }).promoPrice,
    ).toBe(0);
  });
});

describe("resolvePromoCodeValidity", () => {
  const now = new Date("2026-08-04T12:00:00.000Z");

  it("accepts a live unlimited code", () => {
    expect(
      resolvePromoCodeValidity(
        {
          isActive: true,
          startsAt: null,
          expiresAt: null,
          maxUses: null,
          consumingUses: 20,
        },
        now,
      ),
    ).toEqual({ allowed: true });
  });

  it("rejects unavailable codes", () => {
    expect(
      resolvePromoCodeValidity(
        {
          isActive: false,
          startsAt: null,
          expiresAt: null,
          maxUses: null,
          consumingUses: 0,
        },
        now,
      ),
    ).toEqual({ allowed: false, blocker: "inactive" });

    expect(
      resolvePromoCodeValidity(
        {
          isActive: true,
          startsAt: null,
          expiresAt: null,
          maxUses: 2,
          consumingUses: 2,
        },
        now,
      ),
    ).toEqual({ allowed: false, blocker: "exhausted" });

    expect(
      resolvePromoCodeValidity(
        {
          isActive: true,
          startsAt: new Date("2026-08-05T12:00:00.000Z"),
          expiresAt: null,
          maxUses: null,
          consumingUses: 0,
        },
        now,
      ),
    ).toEqual({ allowed: false, blocker: "not_started" });

    expect(
      resolvePromoCodeValidity(
        {
          isActive: true,
          startsAt: null,
          expiresAt: new Date("2026-08-03T12:00:00.000Z"),
          maxUses: null,
          consumingUses: 0,
        },
        now,
      ),
    ).toEqual({ allowed: false, blocker: "expired" });
  });
});

describe("promo code error messages", () => {
  it("provides specific messages for buyer-actionable failures", () => {
    expect(PROMO_CODE_ERROR_MESSAGES.invalidFormat).toBe(
      "El formato del código no es válido",
    );
    expect(PROMO_CODE_ERROR_MESSAGES.notFound).toBe(
      "Este código no existe para este programa",
    );
    expect(promoCodeBlockerMessage("inactive")).toBe(
      "Este código está inactivo",
    );
    expect(promoCodeBlockerMessage("expired")).toBe("Este código ya venció");
    expect(promoCodeBlockerMessage("exhausted")).toBe(
      "Este código alcanzó el límite de usos",
    );
  });

  it("keeps scheduled codes generic", () => {
    expect(promoCodeBlockerMessage("not_started")).toBe(
      PROMO_CODE_ERROR_MESSAGES.unavailable,
    );
  });
});

describe("buildProgramPriceSnapshot", () => {
  it("records both competing prices", () => {
    const snapshot = buildProgramPriceSnapshot({
      eligibilityPrice: {
        rule: "program_discount",
        basis: "active_participant",
        publicPrice: 70,
        participantPrice: null,
        appliedDiscount: { type: "percent", value: 20 },
        amount: 56,
      },
      basePrice: 70,
      existingPrice: 56,
      finalPrice: 35,
      promo: {
        promoCodeId: 3,
        code: "ARTISTA50",
        partnerName: "Artista",
        discountPercent: 50,
        rounding: "floor_whole_bob",
        higherPriceAccepted: false,
      },
    });

    expect(snapshot).toMatchObject({
      version: 2,
      basePrice: 70,
      existingPrice: 56,
      promoPrice: 35,
      discountAmount: 35,
      finalPrice: 35,
    });
  });
});
