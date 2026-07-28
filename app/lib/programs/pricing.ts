import type { ParticipantEligibility } from "@/app/lib/programs/eligibility";

/**
 * Which rule produced a price. Persisted with every purchase line so a
 * historical amount stays explainable without replaying today's configuration.
 *
 * See docs/ARCHITECTURE-paid-programs-and-sessions.md §8.3.
 */
export type PriceRule =
  | "public"
  | "explicit_override"
  | "program_discount"
  | "global_discount";

export type PriceInput = {
  publicPrice: number;
  /** Explicit per-session or per-pass participant price, when set. */
  participantPrice: number | null;
  /** `programs.participantDiscountPercent`, when set. */
  programDiscountPercent: number | null;
  /** `program_settings.defaultParticipantDiscountPercent`. */
  globalDiscountPercent: number;
};

export type ResolvedPrice = {
  amount: number;
  basis: ParticipantEligibility;
  rule: PriceRule;
  snapshot: PriceSnapshot;
};

export type PriceSnapshot = {
  rule: PriceRule;
  basis: ParticipantEligibility;
  publicPrice: number;
  participantPrice: number | null;
  appliedDiscountPercent: number | null;
  amount: number;
};

/**
 * Rounds half-up to two decimals via integer cents. Scaling through
 * micro-units first absorbs binary float noise so values like 10.075
 * become 10.08 instead of 10.07.
 */
export function roundMoney(amount: number): number {
  const micros = Math.round(amount * 1e6);
  return Math.round(micros / 1e4) / 100;
}

/** `1234.5` → `"Bs 1.234,50"`. Every price shown to a buyer goes through this. */
export function formatMoney(amount: number): string {
  const formatted = new Intl.NumberFormat("es-BO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

  return `Bs ${formatted}`;
}

/**
 * The applicable price for a buyer, plus the evidence to persist.
 *
 * A public buyer always pays `publicPrice`. A participant pays an explicit
 * override when one exists, otherwise the program discount, otherwise the
 * global default discount.
 */
export function resolvePrice(
  input: PriceInput,
  eligibility: ParticipantEligibility,
): ResolvedPrice {
  const publicPrice = roundMoney(input.publicPrice);

  if (eligibility === "public") {
    return build(publicPrice, "public", eligibility, input, null);
  }

  if (input.participantPrice !== null) {
    return build(
      roundMoney(input.participantPrice),
      "explicit_override",
      eligibility,
      input,
      null,
    );
  }

  const usesProgramDiscount = input.programDiscountPercent !== null;
  const discountPercent = usesProgramDiscount
    ? input.programDiscountPercent!
    : input.globalDiscountPercent;
  assertDiscountPercent(discountPercent);

  const rule: PriceRule = usesProgramDiscount
    ? "program_discount"
    : "global_discount";

  const amount = roundMoney(publicPrice * (1 - discountPercent / 100));

  return build(amount, rule, eligibility, input, discountPercent);
}

/** Rejects discounts outside the inclusive [0, 100] range. */
function assertDiscountPercent(discountPercent: number): void {
  if (
    !Number.isFinite(discountPercent) ||
    discountPercent < 0 ||
    discountPercent > 100
  ) {
    throw new Error(
      `Invalid discount percent: ${discountPercent}. Expected a value in [0, 100].`,
    );
  }
}

function build(
  amount: number,
  rule: PriceRule,
  basis: ParticipantEligibility,
  input: PriceInput,
  appliedDiscountPercent: number | null,
): ResolvedPrice {
  return {
    amount,
    basis,
    rule,
    snapshot: {
      rule,
      basis,
      publicPrice: roundMoney(input.publicPrice),
      participantPrice:
        input.participantPrice === null
          ? null
          : roundMoney(input.participantPrice),
      appliedDiscountPercent,
      amount,
    },
  };
}

/** A zero price routes the purchase through the free-registration flow. */
export function isFreePrice(amount: number): boolean {
  return amount <= 0;
}

/**
 * What a participant saves versus the public price. Used by the session pages
 * and, in Phase 4, by the Week Pass recommendation.
 */
export function participantSavings(input: PriceInput): number {
  const publicAmount = resolvePrice(input, "public").amount;
  const participantAmount = resolvePrice(input, "active_participant").amount;

  return roundMoney(publicAmount - participantAmount);
}
