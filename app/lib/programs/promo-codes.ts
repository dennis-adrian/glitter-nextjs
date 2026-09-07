import { roundMoney, type PriceSnapshot } from "@/app/lib/programs/pricing";

export const PROMO_CODE_MIN_LENGTH = 3;
export const PROMO_CODE_MAX_LENGTH = 32;
export const PROMO_PARTNER_NAME_MAX_LENGTH = 200;
export const PROMO_INTERNAL_NOTES_MAX_LENGTH = 1000;
export const PROMO_CODE_PATTERN = /^[A-Z0-9_-]+$/;

/** Human-entered codes are case-insensitive and whitespace-insensitive. */
export function normalizePromoCode(value: string): string {
  return value.trim().toUpperCase();
}

export function isValidPromoCodeFormat(value: string): boolean {
  const normalized = normalizePromoCode(value);
  return (
    normalized.length >= PROMO_CODE_MIN_LENGTH &&
    normalized.length <= PROMO_CODE_MAX_LENGTH &&
    PROMO_CODE_PATTERN.test(normalized)
  );
}

export type PromoCodeValidityInput = {
  isActive: boolean;
  startsAt: Date | null;
  expiresAt: Date | null;
  maxUses: number | null;
  consumingUses: number;
};

export type PromoCodeBlocker =
  | "inactive"
  | "not_started"
  | "expired"
  | "exhausted";

export const PROMO_CODE_ERROR_MESSAGES = {
  unavailable: "Este código no está disponible para esta sesión",
  invalidFormat: "El formato del código no es válido",
} as const;

export function promoCodeBlockerMessage(
  _blocker: PromoCodeBlocker | "not_found",
): string {
  return PROMO_CODE_ERROR_MESSAGES.unavailable;
}

export function resolvePromoCodeValidity(
  input: PromoCodeValidityInput,
  now: Date,
): { allowed: true } | { allowed: false; blocker: PromoCodeBlocker } {
  if (!input.isActive) return { allowed: false, blocker: "inactive" };
  if (input.startsAt && now < input.startsAt) {
    return { allowed: false, blocker: "not_started" };
  }
  if (input.expiresAt && now > input.expiresAt) {
    return { allowed: false, blocker: "expired" };
  }
  if (input.maxUses !== null && input.consumingUses >= input.maxUses) {
    return { allowed: false, blocker: "exhausted" };
  }

  return { allowed: true };
}

export type ResolvedPromoPrice = {
  basePrice: number;
  existingPrice: number;
  promoPrice: number;
  discountAmount: number;
  differenceFromExisting: number;
  isHigherThanExisting: boolean;
};

/**
 * Promo percentages replace participant discounts: both are calculated from
 * the public base and compared, never compounded. The final promo price is
 * floored to a whole boliviano using integer cents.
 */
export function resolvePromoPrice(input: {
  basePrice: number;
  existingPrice: number;
  discountPercent: number;
}): ResolvedPromoPrice {
  const { discountPercent } = input;
  if (
    !Number.isInteger(discountPercent) ||
    discountPercent < 1 ||
    discountPercent > 100
  ) {
    throw new Error("Promo discount percent must be an integer in [1, 100]");
  }

  const basePrice = roundMoney(input.basePrice);
  const existingPrice = roundMoney(input.existingPrice);
  if (basePrice < 0 || existingPrice < 0 || existingPrice > basePrice) {
    throw new Error("Promo price inputs are inconsistent");
  }

  const baseCents = Math.round(basePrice * 100);
  const promoPrice = Math.max(
    0,
    Math.floor((baseCents * (100 - discountPercent)) / 10_000),
  );
  const discountAmount = roundMoney(basePrice - promoPrice);
  const differenceFromExisting = roundMoney(promoPrice - existingPrice);

  return {
    basePrice,
    existingPrice,
    promoPrice,
    discountAmount,
    differenceFromExisting,
    isHigherThanExisting: differenceFromExisting > 0,
  };
}

export type ProgramPriceSnapshotV2 = {
  version: 2;
  eligibilityPrice: PriceSnapshot;
  promo: {
    promoCodeId: number;
    code: string;
    partnerName: string;
    discountPercent: number;
    rounding: "floor_whole_bob";
    higherPriceAccepted: boolean;
  } | null;
  basePrice: number;
  existingPrice: number;
  promoPrice: number | null;
  discountAmount: number;
  finalPrice: number;
};

export function buildProgramPriceSnapshot(input: {
  eligibilityPrice: PriceSnapshot;
  basePrice: number;
  existingPrice: number;
  finalPrice: number;
  promo: ProgramPriceSnapshotV2["promo"];
}): ProgramPriceSnapshotV2 {
  return {
    version: 2,
    eligibilityPrice: input.eligibilityPrice,
    promo: input.promo,
    basePrice: roundMoney(input.basePrice),
    existingPrice: roundMoney(input.existingPrice),
    promoPrice: input.promo ? roundMoney(input.finalPrice) : null,
    discountAmount: roundMoney(input.basePrice - input.finalPrice),
    finalPrice: roundMoney(input.finalPrice),
  };
}
